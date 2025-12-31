import {
  autoRefreshService,
  handleAutoRefreshMessage
} from "./services/autoRefreshService"

// 管理临时窗口的 Map
const tempWindows = new Map<string, number>()

// 插件启动时初始化自动刷新服务
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] 插件启动，初始化自动刷新服务")
  await autoRefreshService.initialize()
})

// 插件安装时初始化自动刷新服务
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Background] 插件安装/更新，初始化自动刷新服务")
  await autoRefreshService.initialize()
})

// 处理来自 popup 的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "openTempWindow") {
    handleOpenTempWindow(request, sendResponse)
    return true // 保持异步响应通道
  }

  if (request.action === "closeTempWindow") {
    handleCloseTempWindow(request, sendResponse)
    return true
  }

  if (request.action === "autoDetectSite") {
    handleAutoDetectSite(request, sendResponse)
    return true
  }

  if (request.action === "pageFetchJson") {
    handlePageFetchJson(request, sendResponse)
    return true
  }

  // 处理自动刷新相关消息
  if (
    (request.action && request.action.startsWith("autoRefresh")) ||
    [
      "setupAutoRefresh",
      "refreshNow",
      "stopAutoRefresh",
      "updateAutoRefreshSettings",
      "getAutoRefreshStatus"
    ].includes(request.action)
  ) {
    handleAutoRefreshMessage(request, sendResponse)
    return true
  }
})

// 打开临时窗口访问指定站点
async function handleOpenTempWindow(request: any, sendResponse: Function) {
  try {
    const { url, requestId } = request

    // 创建新窗口
    const window = await chrome.windows.create({
      url: url,
      type: "popup",
      width: 800,
      height: 600,
      focused: false
    })

    if (window.id) {
      // 记录窗口ID
      tempWindows.set(requestId, window.id)
      sendResponse({ success: true, windowId: window.id })
    } else {
      sendResponse({ success: false, error: "无法创建窗口" })
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message })
  }
}

// 关闭临时窗口
async function handleCloseTempWindow(request: any, sendResponse: Function) {
  try {
    const { requestId } = request
    const windowId = tempWindows.get(requestId)

    if (windowId) {
      await chrome.windows.remove(windowId)
      tempWindows.delete(requestId)
    }

    sendResponse({ success: true })
  } catch (error) {
    sendResponse({ success: false, error: error.message })
  }
}

// 在页面上下文（MAIN world）发起请求并返回 JSON（用于需要站点 Cookie/HttpOnly 的场景）
async function handlePageFetchJson(request: any, sendResponse: Function) {
  const { url, requestId, fetchUrl } = request

  if (!url || !requestId || !fetchUrl) {
    sendResponse({ success: false, error: "缺少参数: url/requestId/fetchUrl" })
    return
  }

  try {
    // 1. 打开临时窗口（确保处于目标站点的 first-party 上下文）
    const window = await chrome.windows.create({
      url: url,
      type: "popup",
      width: 800,
      height: 600,
      focused: false
    })

    if (!window.id || !window.tabs?.[0]?.id) {
      throw new Error("无法创建窗口或获取标签页")
    }

    const windowId = window.id
    const tabId = window.tabs[0].id

    tempWindows.set(requestId, windowId)

    // 2. 等待页面加载完成
    await waitForTabComplete(tabId)

    // 3. 在 MAIN world 执行 fetch（携带站点 cookie）
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [fetchUrl],
      func: async (u: string) => {
        try {
          const response = await fetch(u, { method: "GET", credentials: "include" })
          const text = await response.text()
          let data: any = null
          try {
            data = text ? JSON.parse(text) : null
          } catch {
            data = text
          }
          return {
            ok: response.ok,
            status: response.status,
            data,
            url: response.url
          }
        } catch (err: any) {
          return {
            ok: false,
            status: 0,
            error: err?.message || String(err)
          }
        }
      }
    })

    const result = injectionResults?.[0]?.result as any
    if (!result) {
      throw new Error("脚本注入未返回结果")
    }

    if (!result.ok) {
      const statusPart = result.status ? `HTTP ${result.status}` : "请求失败"
      const errorPart = result.error ? `: ${result.error}` : ""
      throw new Error(`${statusPart}${errorPart}`)
    }

    // 4. 关闭临时窗口
    await chrome.windows.remove(windowId)
    tempWindows.delete(requestId)

    sendResponse({ success: true, data: result.data })
  } catch (error: any) {
    // 清理窗口
    const windowId = tempWindows.get(requestId)
    if (windowId) {
      try {
        await chrome.windows.remove(windowId)
        tempWindows.delete(requestId)
      } catch (cleanupError) {
        console.log("清理窗口失败:", cleanupError)
      }
    }

    sendResponse({ success: false, error: error?.message || "未知错误" })
  }
}

// 自动检测站点信息
async function handleAutoDetectSite(request: any, sendResponse: Function) {
  const { url, requestId } = request

  try {
    // 1. 打开临时窗口
    const window = await chrome.windows.create({
      url: url,
      type: "popup",
      width: 800,
      height: 600,
      focused: false
    })

    if (!window.id || !window.tabs?.[0]?.id) {
      throw new Error("无法创建窗口或获取标签页")
    }

    const windowId = window.id
    const tabId = window.tabs[0].id

    // 记录窗口
    tempWindows.set(requestId, windowId)

    // 2. 等待页面加载完成
    await waitForTabComplete(tabId)

    // 3. 通过 content script 获取用户信息
    const userResponse = await chrome.tabs.sendMessage(tabId, {
      action: "getUserFromLocalStorage",
      url: url
    })
    console.log(userResponse.error)

    if (!userResponse.success) {
      throw new Error(userResponse.error)
    }

    // 4. 关闭临时窗口
    await chrome.windows.remove(windowId)
    tempWindows.delete(requestId)

    // 5. 返回结果
    sendResponse({
      success: true,
      data: {
        userId: userResponse.data.userId,
        user: userResponse.data.user
      }
    })
  } catch (error) {
    // 清理窗口
    const windowId = tempWindows.get(requestId)
    if (windowId) {
      try {
        await chrome.windows.remove(windowId)
        tempWindows.delete(requestId)
      } catch (cleanupError) {
        console.log("清理窗口失败:", cleanupError)
      }
    }

    sendResponse({ success: false, error: error.message })
  }
}

// 等待标签页加载完成
function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("页面加载超时"))
    }, 10000) // 10秒超时

    const checkStatus = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          clearTimeout(timeout)
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        if (tab.status === "complete") {
          clearTimeout(timeout)
          // 再等待一秒确保页面完全加载
          setTimeout(resolve, 1000)
        } else {
          setTimeout(checkStatus, 100)
        }
      })
    }

    checkStatus()
  })
}

// 监听窗口关闭事件，清理记录
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, storedWindowId] of tempWindows.entries()) {
    if (storedWindowId === windowId) {
      tempWindows.delete(requestId)
      break
    }
  }
})
