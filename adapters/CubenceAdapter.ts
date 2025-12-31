import type { ISiteAdapter } from "./ISiteAdapter"
import {
  AdapterCapability,
  type AutoDetectResult,
  type BalanceInfo,
  type SiteCredentials,
  type SiteStatusInfo,
  type UsageStats,
  type ValidateResult
} from "./types"

type CubenceOverviewResponse = {
  success: boolean
  data?: {
    user?: {
      username?: string
      role?: string
      created_at?: string
      invite_code?: string
    }
    balance?: {
      total_balance?: number
      total_balance_dollar?: number
      normal_balance?: number
      normal_balance_dollar?: number
      subscription_balance?: number
      subscription_balance_dollar?: number
      charity_balance?: number
      charity_balance_dollar?: number
    }
    ace_daily_quota?: {
      limit?: number
      remaining?: number
      used?: number
      reset_at?: number
    }
  }
}

type CubenceAnalyticsTodayResponse = {
  code?: number | string
  message?: string
  data?: {
    today_consumed_quota?: number
    today_request_count?: number
    today_tokens?: number
  }
}

export class CubenceAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "cubence",
    name: "Cubence",
    version: "1.0.0",
    supportedSiteTypes: ["cubence"],
    capabilities: [
      AdapterCapability.AUTO_DETECT,
      AdapterCapability.BALANCE,
      AdapterCapability.USAGE_STATS
    ],
    balance: {
      rawUnit: "micro_usd",
      conversionFactor: 1_000_000
    }
  } as const

  async validateConnection(credentials: SiteCredentials): Promise<ValidateResult> {
    if (credentials.auth.kind !== "cookie") {
      return { ok: false, message: "Cubence 适配器需要 cookie 鉴权（浏览器登录态）" }
    }

    try {
      const overview = await this.fetchOverview(credentials.siteUrl)
      if (!overview.success || !overview.data) {
        return { ok: false, message: "Cubence overview 响应格式异常" }
      }

      const username = overview.data.user?.username
      if (!username) {
        return { ok: false, message: "未获取到用户名，可能未登录或 Cookie 已失效" }
      }

      return { ok: true, details: { username } }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      return { ok: false, message }
    }
  }

  async autoDetectAccount(siteUrl: string): Promise<AutoDetectResult> {
    if (!siteUrl.trim()) {
      return { success: false, error: "站点地址不能为空" }
    }

    try {
      const overview = await this.fetchOverview(siteUrl.trim())
      if (!overview.success || !overview.data) {
        return { success: false, error: "Cubence overview 响应格式异常" }
      }

      const username = overview.data.user?.username
      if (!username) {
        return { success: false, error: "未获取到用户名，可能未登录或 Cookie 已失效" }
      }

      // 兼容现有 UI：cubence 不提供 accessToken/userId，先返回空串占位
      return {
        success: true,
        data: {
          username,
          accessToken: "",
          userId: "",
          exchangeRate: null
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      return { success: false, error: message }
    }
  }

  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    if (credentials.auth.kind !== "cookie") {
      throw new Error("Cubence 适配器需要 cookie 鉴权（浏览器登录态）")
    }

    const overview = await this.fetchOverview(credentials.siteUrl)
    if (!overview.success || !overview.data) {
      throw new Error("Cubence overview 响应格式异常")
    }

    const balance = overview.data.balance
    const raw = balance?.total_balance
    const usd = balance?.total_balance_dollar

    const conversionFactor = this.metadata.balance.conversionFactor
    const rawBalance =
      typeof raw === "number"
        ? raw
        : typeof usd === "number"
          ? Math.round(usd * conversionFactor)
          : 0

    return {
      rawBalance,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor,
      balanceUSD: rawBalance / conversionFactor
    }
  }

  async getUsageStats(credentials: SiteCredentials): Promise<UsageStats> {
    if (credentials.auth.kind !== "cookie") {
      throw new Error("Cubence 适配器需要 cookie 鉴权（浏览器登录态）")
    }

    const today = await this.fetchAnalyticsToday(credentials.siteUrl)
    const code = today?.code
    const ok = code === 200 || code === "200" || typeof code === "undefined"
    if (!ok || !today?.data) {
      const message = today?.message ? `: ${today.message}` : ""
      throw new Error(`Cubence analytics/today 响应异常 (code=${String(code)})${message}`)
    }

    return {
      rawConsumption: today.data.today_consumed_quota ?? 0,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      // Cubence 仅返回总 tokens，先映射到 promptTokens（UI 显示为 upload），download 置 0
      promptTokens: today.data.today_tokens ?? 0,
      completionTokens: 0,
      requestCount: today.data.today_request_count ?? 0
    }
  }

  async getSiteStatus(siteUrl: string): Promise<SiteStatusInfo> {
    // 站点类型识别：基于域名特征，无需网络探测
    try {
      const url = new URL(siteUrl)
      const host = url.hostname.toLowerCase()
      if (host === "cubence.com" || host.endsWith(".cubence.com")) {
        return { detected: true, host }
      }
    } catch {
      // ignore
    }
    return null as any
  }

  // ---- private ----

  private async fetchOverview(siteUrl: string): Promise<CubenceOverviewResponse> {
    return this.fetchJson<CubenceOverviewResponse>(siteUrl, "/api/v1/dashboard/overview", "cubence-overview")
  }

  private async fetchAnalyticsToday(siteUrl: string): Promise<CubenceAnalyticsTodayResponse> {
    return this.fetchJson<CubenceAnalyticsTodayResponse>(siteUrl, "/api/v1/analytics/today", "cubence-analytics-today")
  }

  private async fetchJson<T>(siteUrl: string, path: string, requestIdPrefix: string): Promise<T> {
    const baseUrl = normalizeSiteUrl(siteUrl)
    const fetchUrl = new URL(path, baseUrl).toString()

    // 先尝试直接 fetch（若 Cookie SameSite=None 则可用，避免频繁开窗）
    try {
      const response = await fetch(fetchUrl, { method: "GET", credentials: "include" })
      if (response.ok) {
        return (await response.json()) as T
      }
    } catch {
      // ignore and fallback
    }

    // 回退：通过 background 在页面上下文发起请求，确保携带登录 Cookie（含 HttpOnly）
    const requestId = `${requestIdPrefix}-${Date.now()}`
    const response = await chrome.runtime.sendMessage({
      action: "pageFetchJson",
      url: baseUrl,
      fetchUrl,
      requestId
    })

    if (!response?.success) {
      throw new Error(response?.error || `获取 ${path} 失败`)
    }

    return response.data as T
  }
}

function normalizeSiteUrl(siteUrl: string): string {
  return (siteUrl || "").trim().replace(/\/+$/, "")
}
