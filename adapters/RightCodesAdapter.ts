import type { ISiteAdapter } from "./ISiteAdapter"
import {
  AdapterCapability,
  type AutoDetectResult,
  type BalanceInfo,
  type SiteCredentials,
  type SiteStatusInfo,
  type TimeRange,
  type UsageStats,
  type ValidateResult
} from "./types"

type RightCodesMeResponse = {
  id?: number
  username?: string
  email?: string
  balance?: number
  user_token?: string
  invite_code?: string
  inviter_id?: number | null
  is_banned?: boolean
  is_admin?: number
  created_at?: string
  updated_at?: string
  // 包月订阅字段（需要验证 API 实际返回）
  expire_time?: number          // 订阅到期时间戳（秒）
  subscription_status?: string  // 订阅状态: "active" | "expired" | "cancelled"
  daily_limit?: number          // 每日额度限制（USD）
  plan_type?: string            // 套餐类型: "monthly" | "yearly" | "pay-as-you-go"
  daily_used?: number           // 今日已用额度（USD）
}

type RightCodesSubscriptionListItem = {
  id?: number
  name?: string
  user_id?: number
  item_id?: number
  tier_id?: number
  total_quota?: number
  remaining_quota?: number
  duration_hours?: number
  expired_at?: string
  last_reset_at?: string
  created_at?: string
  updated_at?: string
  reset_today?: boolean
}

type RightCodesSubscriptionsListResponse = {
  subscriptions?: RightCodesSubscriptionListItem[]
  total?: number
}

type RightCodesUsageTrendItem = {
  date?: string
  requests?: number
  cost?: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_tokens?: number
  cache_read_tokens?: number
}

type RightCodesUsageStatsAdvancedResponse = {
  trend?: RightCodesUsageTrendItem[]
  total_requests?: number
  total_cost?: number
  total_tokens?: number
  tokens_by_model?: Record<string, number>
  details_by_model?: any[]
}

export class RightCodesAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "right.codes",
    name: "Right.Codes",
    version: "1.0.0",
    supportedSiteTypes: ["right.codes"],
    capabilities: [
      AdapterCapability.AUTO_DETECT,
      AdapterCapability.BALANCE,
      AdapterCapability.USAGE_STATS
    ],
    balance: {
      rawUnit: "USD",
      conversionFactor: 1
    }
  } as const

  async validateConnection(credentials: SiteCredentials): Promise<ValidateResult> {
    try {
      const me =
        credentials.auth.kind === "api-key"
          ? await this.fetchMe(credentials.siteUrl, credentials.auth.apiKey)
          : credentials.auth.kind === "cookie"
            ? await this.fetchMe(credentials.siteUrl)
            : null

      if (!me) {
        return {
          ok: false,
          message: "Right.Codes 适配器仅支持 api-key（Bearer token）或 cookie 鉴权"
        }
      }

      const username = me.username?.trim() || ""
      if (!username) {
        return { ok: false, message: "未获取到用户名，可能未登录或 Cookie 已失效" }
      }
      if (me.is_banned) {
        return { ok: false, message: "账号已被封禁（is_banned=true）" }
      }
      return { ok: true, details: { username, id: me.id, user_token: me.user_token } }
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
      const me = await this.fetchMe(siteUrl.trim())
      const username = me.username?.trim() || ""
      if (!username) {
        return { success: false, error: "未获取到用户名，可能未登录或 Cookie 已失效" }
      }

      return {
        success: true,
        data: {
          username,
          // Right.Codes: 使用 Bearer token（user_token）作为调用凭据
          accessToken: me.user_token || "",
          userId: typeof me.id === "number" ? String(me.id) : "",
          exchangeRate: null
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      return { success: false, error: message }
    }
  }
  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    const me =
      credentials.auth.kind === "api-key"
        ? await this.fetchMe(credentials.siteUrl, credentials.auth.apiKey)
        : credentials.auth.kind === "cookie"
          ? await this.fetchMe(credentials.siteUrl)
          : null

    if (!me) {
      throw new Error("Right.Codes 适配器仅支持 api-key（Bearer token）或 cookie 鉴权")
    }

    const balance = typeof me.balance === "number" ? me.balance : 0

    const tokenFromCredentials =
      credentials.auth.kind === "api-key" ? normalizeBearerToken(credentials.auth.apiKey) : ""
    const token = tokenFromCredentials || normalizeBearerToken(me.user_token)

    let expireTime: number | undefined = undefined
    let subscriptionStatus: string | undefined = undefined
    let totalQuota: number | undefined = undefined
    let usedQuota: number | undefined = undefined
    let planName: string | undefined = undefined
    let subscriptionsFetched = false

    try {
      const list = await this.fetchSubscriptionsList(credentials.siteUrl, token || undefined)
      subscriptionsFetched = true

      const subscriptions = Array.isArray(list.subscriptions) ? list.subscriptions : []
      const parsed = subscriptions
        .map((sub) => {
          const ms = sub.expired_at ? Date.parse(sub.expired_at) : NaN
          const expireTime = Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
          return { sub, expireTime }
        })
        .filter((item): item is { sub: RightCodesSubscriptionListItem; expireTime: number } =>
          typeof item.expireTime === "number"
        )

      parsed.sort((a, b) => a.expireTime - b.expireTime)

      const now = Date.now() / 1000
      const active = parsed.find((item) => item.expireTime > now)
      const chosen = active ?? (parsed.length > 0 ? parsed[parsed.length - 1] : null)
      if (chosen) {
        expireTime = chosen.expireTime
        subscriptionStatus = expireTime > now ? "active" : "expired"
        planName = chosen.sub.name

        if (typeof chosen.sub.total_quota === "number") {
          totalQuota = chosen.sub.total_quota
        }
        if (typeof chosen.sub.total_quota === "number" && typeof chosen.sub.remaining_quota === "number") {
          usedQuota = Math.max(0, chosen.sub.total_quota - chosen.sub.remaining_quota)
        }
      }
    } catch {
      // ignore subscription fetch errors; balance should still work
    }

    const extra = subscriptionsFetched
      ? {
          expire_time: expireTime,
          subscription_status: subscriptionStatus,
          daily_limit: totalQuota,
          plan_type: planName,
          daily_used: usedQuota
        }
      : undefined

    return {
      rawBalance: balance,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      balanceUSD: balance,
      extra
    }
  }

  async getUsageStats(credentials: SiteCredentials, timeRange: TimeRange): Promise<UsageStats> {
    if (credentials.auth.kind !== "api-key" && credentials.auth.kind !== "cookie") {
      throw new Error("Right.Codes 适配器仅支持 api-key（Bearer token）或 cookie 鉴权")
    }

    let token = credentials.auth.kind === "api-key" ? normalizeBearerToken(credentials.auth.apiKey) : ""
    if (!token && credentials.auth.kind === "cookie") {
      const me = await this.fetchMe(credentials.siteUrl)
      token = normalizeBearerToken(me.user_token)
    }

    const data = await this.fetchUsageStatsAdvanced(credentials.siteUrl, timeRange, token || undefined)
    const trend = Array.isArray(data.trend) ? data.trend : []

    const promptTokens = trend.reduce((sum, item) => sum + (item.input_tokens ?? 0), 0)
    const completionTokens = trend.reduce((sum, item) => sum + (item.output_tokens ?? 0), 0)

    return {
      rawConsumption: data.total_cost ?? 0,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      promptTokens,
      completionTokens,
      requestCount: data.total_requests ?? 0
    }
  }

  async getSiteStatus(siteUrl: string): Promise<SiteStatusInfo> {
    try {
      const url = new URL(siteUrl)
      const host = url.hostname.toLowerCase()
      if (host === "right.codes" || host.endsWith(".right.codes")) {
        return { detected: true, host }
      }
    } catch {
      // ignore
    }
    return null as any
  }

  // ---- private ----

  private async fetchSubscriptionsList(
    siteUrl: string,
    token?: string
  ): Promise<RightCodesSubscriptionsListResponse> {
    return this.fetchJson<RightCodesSubscriptionsListResponse>(
      siteUrl,
      "/subscriptions/list",
      "rightcodes-subscriptions-list",
      token
    )
  }

  private async fetchMe(siteUrl: string, token?: string): Promise<RightCodesMeResponse> {
    return this.fetchJson<RightCodesMeResponse>(siteUrl, "/auth/me", "rightcodes-me", token)
  }

  private async fetchUsageStatsAdvanced(
    siteUrl: string,
    timeRange: TimeRange,
    token?: string
  ): Promise<RightCodesUsageStatsAdvancedResponse> {
    const baseUrl = normalizeSiteUrl(siteUrl)
    const url = new URL("/use-log/stats/advanced", baseUrl)

    url.searchParams.set("start_date", formatLocalDateTime(new Date(timeRange.start * 1000)))
    url.searchParams.set("end_date", formatLocalDateTime(new Date(timeRange.end * 1000)))
    url.searchParams.set("granularity", "day")

    return this.fetchJson<RightCodesUsageStatsAdvancedResponse>(
      baseUrl,
      `${url.pathname}${url.search}`,
      "rightcodes-usage-advanced",
      token
    )
  }

  private async fetchJson<T>(
    siteUrl: string,
    path: string,
    requestIdPrefix: string,
    token?: string
  ): Promise<T> {
    const baseUrl = normalizeSiteUrl(siteUrl)
    const fetchUrl = new URL(path, baseUrl).toString()
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    }
    const normalizedToken = normalizeBearerToken(token)
    if (normalizedToken) {
      headers["Authorization"] = `Bearer ${normalizedToken}`
    }

    const directFetch = async (credentials: RequestCredentials): Promise<T | null> => {
      try {
        const response = await fetch(fetchUrl, { method: "GET", credentials, headers })
        if (!response.ok) return null
        return (await response.json()) as T
      } catch {
        return null
      }
    }

    // 优先：Bearer token（不带 Cookie）
    if (normalizedToken) {
      const tokenOnly = await directFetch("omit")
      if (tokenOnly !== null) return tokenOnly

      // 兼容：某些站点可能还需要 Cookie（如 cf_clearance），再尝试带 cookie 的请求
      const tokenWithCookie = await directFetch("include")
      if (tokenWithCookie !== null) return tokenWithCookie
    } else {
      // Cookie 模式（尝试直接请求；若 SameSite 不允许则回退到 pageFetchJson）
      const cookieMode = await directFetch("include")
      if (cookieMode !== null) return cookieMode
    }

    const requestId = `${requestIdPrefix}-${Date.now()}`
    const response = await chrome.runtime.sendMessage({
      action: "pageFetchJson",
      url: baseUrl,
      fetchUrl,
      requestId,
      headers
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

function normalizeBearerToken(token?: string): string {
  const raw = (token || "").trim()
  if (!raw) return ""
  return raw.replace(/^bearer\s+/i, "").trim()
}

function formatLocalDateTime(date: Date): string {
  const pad2 = (num: number) => String(num).padStart(2, "0")
  const yyyy = date.getFullYear()
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  const hh = pad2(date.getHours())
  const min = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`
}
