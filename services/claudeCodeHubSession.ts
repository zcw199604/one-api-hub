type QuotaResult = { success: boolean; data?: unknown; error?: string }
export type ClaudeCodeHubStatsRange = { startTime: number; endTime: number } // 毫秒时间戳
let backgroundReader: ((url: string, stats?: ClaudeCodeHubStatsRange) => Promise<QuotaResult>) | undefined

export function setClaudeCodeHubQuotaReader(reader: NonNullable<typeof backgroundReader>) {
  backgroundReader = reader
}

export function readClaudeCodeHubQuota(url: string, stats?: ClaudeCodeHubStatsRange): Promise<QuotaResult> {
  return backgroundReader ? backgroundReader(url, stats) : chrome.runtime.sendMessage({
    action: "readClaudeCodeHubQuota", url, stats
  })
}

// Injected into MAIN world. Only these fixed, read-only actions can be requested.
export async function readClaudeCodeHubQuotaInPage(origin: string, stats?: ClaudeCodeHubStatsRange): Promise<QuotaResult> {
  try {
    if (location.origin !== origin) throw new Error("站点发生跳转，无法读取配额")
    if (stats) {
      if (!Number.isSafeInteger(stats.startTime) || !Number.isSafeInteger(stats.endTime) || stats.startTime >= stats.endTime) {
        throw new Error("统计时间范围无效")
      }
      const params = new URLSearchParams({
        startTime: String(stats.startTime), endTime: String(stats.endTime), excludeStatusCode200: "false"
      })
      const summary = await fetch(`${origin}/api/v1/usage-logs/stats?${params}`, {
        method: "GET", credentials: "include", redirect: "error", cache: "no-store",
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000)
      })
      if (!summary.ok) {
        throw new Error(`HTTP ${summary.status}: ${summary.status === 401 ? "登录已失效，请重新登录站点" : "用量统计接口请求失败"}`)
      }
      return { success: true, data: await summary.json() }
    }
    const response = await fetch(`${origin}/api/actions/my-usage/getMyQuota`, {
      method: "POST", credentials: "include", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(15000)
    })
    if (response.status === 403) {
      // Some deployments deny the Actions API while still serving the user's quota page.
      // Read only the rendered user totals; never inspect cookies or execute page scripts.
      const page = await fetch(`${origin}/zh-CN/dashboard/my-quota`, {
        method: "GET", credentials: "include", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(15000)
      })
      if (!page.ok) throw new Error(`配额接口 HTTP 403，配额页面 HTTP ${page.status}`)
      const doc = new DOMParser().parseFromString(await page.text(), "text/html")
      const totals = Array.from(doc.querySelectorAll('[role="progressbar"]')).filter(element => {
        const title = element.parentElement?.parentElement?.firstElementChild?.textContent?.trim()
        return title === "总额度" && element.getAttribute("aria-label")?.startsWith("用户:")
      })
      const username = doc.querySelector('header [data-slot="avatar"]')?.nextElementSibling?.textContent?.trim()
      const label = totals.length === 1 ? totals[0].getAttribute("aria-label") : null
      const match = label?.match(/^用户:\s*\$(-?[\d,]+(?:\.\d+)?)\s*\/\s*\$(-?[\d,]+(?:\.\d+)?)$/)
      if (!username || !match) {
        throw new Error("配额接口 HTTP 403，页面未提供可识别的用户总额度；请确认已登录且用户总额度不是无限")
      }
      const used = Number(match[1].replace(/,/g, ""))
      const limit = Number(match[2].replace(/,/g, ""))
      if (!Number.isFinite(used) || !Number.isFinite(limit)) throw new Error("配额页面金额格式异常")
      const dailyRows = Array.from(doc.querySelectorAll('[role="progressbar"]')).filter(element => {
        const title = element.parentElement?.parentElement?.firstElementChild?.textContent?.trim()
        return title === "日额度" && element.getAttribute("aria-label")?.startsWith("用户:")
      })
      // Unlimited limits have no amount in aria-label; the adjacent text still shows usage.
      const dailyText = dailyRows.length === 1 ? dailyRows[0].nextElementSibling?.textContent?.trim() : null
      const dailyMatch = dailyText?.match(/^\$([\d,]+(?:\.\d+)?)\s*\//)
      const dailyUsed = dailyMatch ? Number(dailyMatch[1].replace(/,/g, "")) : undefined
      return { success: true, data: { ok: true, data: {
        userName: username, userCurrentTotalUsd: used, userLimitTotalUsd: limit,
        userCurrentDailyUsd: dailyUsed
      } } }
    }
    if (!response.ok) {
      let reason = response.status === 401 ? "登录已失效，请重新登录站点" : "配额接口请求失败"
      try {
        const detail = await response.json()
        if (typeof detail.error === "string" && detail.error) reason = detail.error.slice(0, 200)
      } catch { /* The server may return a non-JSON error page. */ }
      throw new Error(`HTTP ${response.status}: ${reason}`)
    }
    return { success: true, data: await response.json() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "读取配额失败" }
  }
}
