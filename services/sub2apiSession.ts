export interface Sub2ApiRecoveryRequest {
  url: string
  expectedUserId: string
  failedToken: string
}

type RecoveryResult = { success: boolean; token?: string; error?: string }
let backgroundRecovery: ((request: Sub2ApiRecoveryRequest) => Promise<RecoveryResult>) | undefined

// runtime.sendMessage does not deliver to the sending background context itself.
export function setSub2ApiBackgroundRecovery(handler: NonNullable<typeof backgroundRecovery>) {
  backgroundRecovery = handler
}

export function recoverSub2ApiCredentials(request: Sub2ApiRecoveryRequest): Promise<RecoveryResult> {
  return backgroundRecovery ? backgroundRecovery(request) : chrome.runtime.sendMessage({
    ...request, action: "recoverSub2ApiSession"
  })
}

// This function is injected into the site's MAIN world. Keep it self-contained.
export async function recoverSub2ApiSessionInPage(
  origin: string,
  expectedUserId: string,
  failedToken: string
): Promise<RecoveryResult> {
  try {
    if (location.origin !== origin) throw new Error("站点发生跳转，无法更新凭据")
    const userId = () => {
      try { return String(JSON.parse(localStorage.getItem("auth_user") || "null")?.id || "") }
      catch { return "" }
    }
    const assertAccount = () => {
      if (!expectedUserId || userId() !== expectedUserId) {
        throw new Error("浏览器登录账号与当前账号不一致，请登录对应 Sub2API 账号")
      }
    }
    const profileMatches = async (token: string): Promise<boolean> => {
      const response = await fetch(`${origin}/api/v1/user/profile`, {
        credentials: "omit", headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000)
      })
      if (response.status === 401) return false
      if (!response.ok) throw new Error(`HTTP ${response.status}: 校验 Sub2API 账号失败`)
      const payload = await response.json()
      if (payload.code !== 0 || String(payload.data?.id) !== expectedUserId) {
        throw new Error("Sub2API 返回的账号身份不一致，未更新凭据")
      }
      assertAccount()
      return true
    }
    const refresh = async () => {
      assertAccount()
      const currentToken = localStorage.getItem("auth_token") || ""
      if (currentToken && currentToken !== failedToken && await profileMatches(currentToken)) {
        return { success: true, token: currentToken }
      }
      assertAccount()
      const refreshToken = localStorage.getItem("refresh_token")
      if (!refreshToken) throw new Error("缺少 Sub2API 刷新令牌，请在站点重新登录")
      const response = await fetch(`${origin}/api/v1/auth/refresh`, {
        method: "POST", credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: AbortSignal.timeout(30000)
      })
      // Never overwrite a login/logout or token rotation that happened during the request.
      assertAccount()
      if (localStorage.getItem("refresh_token") !== refreshToken) {
        const peerToken = localStorage.getItem("auth_token") || ""
        if (peerToken && peerToken !== currentToken && await profileMatches(peerToken)) {
          return { success: true, token: peerToken }
        }
        throw new Error("Sub2API 登录状态已变化，请重试")
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 400) {
          throw new Error("Sub2API 登录已过期，请在站点重新登录后刷新")
        }
        throw new Error(`HTTP ${response.status}: Sub2API 凭据更新失败`)
      }
      const payload = await response.json()
      const pair = payload.data
      if (payload.code !== 0 || typeof pair?.access_token !== "string" || !pair.access_token ||
          typeof pair.refresh_token !== "string" || !pair.refresh_token ||
          typeof pair.expires_in !== "number" || !Number.isFinite(pair.expires_in) || pair.expires_in <= 0) {
        throw new Error("Sub2API 凭据更新响应异常")
      }
      assertAccount()
      if (localStorage.getItem("refresh_token") !== refreshToken) {
        throw new Error("Sub2API 登录状态已变化，请重试")
      }
      localStorage.setItem("auth_token", pair.access_token)
      localStorage.setItem("token_expires_at", String(Date.now() + pair.expires_in * 1000))
      // Match the official commit order: refresh token is the final commit marker.
      localStorage.setItem("refresh_token", pair.refresh_token)
      // Preserve the rotated pair even if the profile endpoint is temporarily unavailable.
      // Only return the access token to the extension after server-side identity validation.
      if (!await profileMatches(pair.access_token)) throw new Error("Sub2API 新凭据无效，请重新登录")
      return { success: true, token: pair.access_token }
    }
    // Same origin + lock name as the official frontend coordinates all participating tabs.
    if (!navigator.locks) throw new Error("浏览器不支持安全的凭据续期，请更新浏览器后重试")
    return await navigator.locks.request("sub2api-auth-token-refresh", {
      signal: AbortSignal.timeout(45000)
    }, refresh)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Sub2API 凭据更新失败" }
  }
}
