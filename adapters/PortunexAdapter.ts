import type { ISiteAdapter } from "./ISiteAdapter"
import {
  AdapterCapability,
  type BalanceInfo,
  type SiteCredentials,
  type SiteStatusInfo,
  type TimeRange,
  type UsageStats,
  type ValidateResult
} from "./types"

type PortunexMeResponse = {
  id?: number
  email?: string
  role?: string
  points?: number
  created_at?: string
}

type PortunexUserStatsResponse = {
  user_id?: number
  total_requests?: number
  total_input_tokens?: number
  total_output_tokens?: number
  total_points_consumed?: number
}

export class PortunexAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "portunex",
    name: "Portunex",
    version: "1.0.0",
    supportedSiteTypes: ["portunex"],
    capabilities: [AdapterCapability.BALANCE, AdapterCapability.USAGE_STATS],
    balance: {
      rawUnit: "points",
      conversionFactor: 1
    }
  } as const

  async validateConnection(credentials: SiteCredentials): Promise<ValidateResult> {
    if (credentials.auth.kind !== "api-key") {
      return { ok: false, message: "Portunex 适配器需要 api-key（Bearer token）鉴权" }
    }

    try {
      const me = await this.fetchMe(credentials.siteUrl, credentials.auth.apiKey)

      const username = (me.email || "").trim() || (typeof me.id === "number" ? String(me.id) : "")
      if (!username) {
        return { ok: false, message: "未获取到用户信息，Token 可能无效或已过期" }
      }

      return { ok: true, details: { username, id: me.id, email: me.email, role: me.role } }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      return { ok: false, message }
    }
  }

  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    if (credentials.auth.kind !== "api-key") {
      throw new Error("Portunex 适配器需要 api-key（Bearer token）鉴权")
    }

    const me = await this.fetchMe(credentials.siteUrl, credentials.auth.apiKey)

    return {
      rawBalance: typeof me.points === "number" ? me.points : 0,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      balanceUSD: typeof me.points === "number" ? me.points : 0
    }
  }

  async getUsageStats(credentials: SiteCredentials, timeRange: TimeRange): Promise<UsageStats> {
    if (credentials.auth.kind !== "api-key") {
      throw new Error("Portunex 适配器需要 api-key（Bearer token）鉴权")
    }

    const startTime = new Date(timeRange.start * 1000).toISOString()
    const endTime = new Date(timeRange.end * 1000 + 999).toISOString()

    const stats = await this.fetchMyStats(credentials.siteUrl, credentials.auth.apiKey, {
      start_time: startTime,
      end_time: endTime,
      granularity: "hour"
    })

    return {
      rawConsumption: stats.total_points_consumed ?? 0,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      promptTokens: stats.total_input_tokens ?? 0,
      completionTokens: stats.total_output_tokens ?? 0,
      requestCount: stats.total_requests ?? 0
    }
  }

  async getSiteStatus(siteUrl: string): Promise<SiteStatusInfo> {
    try {
      const url = new URL(siteUrl)
      const host = url.hostname.toLowerCase()
      if (
        host === "portunex.gewulabs.group" ||
        host.endsWith(".portunex.gewulabs.group") ||
        host === "api.portunex.gewulabs.group"
      ) {
        return { detected: true, host }
      }
    } catch {
      // ignore
    }
    return null as any
  }

  // ---- private ----

  private async fetchMe(siteUrl: string, token: string): Promise<PortunexMeResponse> {
    return this.fetchJson<PortunexMeResponse>(siteUrl, "/portunex/users/me", token, "portunex-me")
  }

  private async fetchMyStats(
    siteUrl: string,
    token: string,
    query: { start_time: string; end_time: string; granularity: string }
  ): Promise<PortunexUserStatsResponse> {
    const url = new URL("/portunex/users/me/stats", PORTUNEX_API_ORIGIN)
    url.searchParams.set("start_time", query.start_time)
    url.searchParams.set("end_time", query.end_time)
    url.searchParams.set("granularity", query.granularity)
    return this.fetchJson<PortunexUserStatsResponse>(
      siteUrl,
      `${url.pathname}${url.search}`,
      token,
      "portunex-stats"
    )
  }

  private async fetchJson<T>(
    siteUrl: string,
    path: string,
    token: string,
    requestIdPrefix: string
  ): Promise<T> {
    const fetchUrl = new URL(path, PORTUNEX_API_ORIGIN).toString()

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*"
    }
    const normalizedToken = normalizeBearerToken(token)
    if (!normalizedToken) {
      throw new Error("缺少 Bearer token")
    }
    headers["Authorization"] = `Bearer ${normalizedToken}`

    const directFetch = async (): Promise<
      | { kind: "ok"; data: T }
      | { kind: "http_error"; status: number }
      | { kind: "network_error"; error: unknown }
    > => {
      try {
        const response = await fetch(fetchUrl, { method: "GET", headers, credentials: "omit" })
        if (!response.ok) return { kind: "http_error", status: response.status }
        return { kind: "ok", data: (await response.json()) as T }
      } catch (error) {
        return { kind: "network_error", error }
      }
    }

    // 优先：扩展后台直接请求（host_permissions 允许跨域）
    const direct = await directFetch()
    if (direct.kind === "ok") return direct.data

    // 若返回 401/403，可能是服务端对 Origin/站点策略敏感；尝试在站点页面上下文发起请求
    if (direct.kind === "http_error" && direct.status !== 401 && direct.status !== 403) {
      throw new Error(`HTTP ${direct.status}: 获取 ${path} 失败`)
    }

    // 回退：在站点页面上下文请求（避免扩展 Origin 导致的鉴权失败）
    const baseUrl = normalizeSiteUrl(siteUrl)
    const requestId = `${requestIdPrefix}-${Date.now()}`
    const response = await chrome.runtime.sendMessage({
      action: "pageFetchJson",
      url: baseUrl,
      fetchUrl,
      requestId,
      headers,
      credentials: "omit"
    })

    if (!response?.success) {
      if (direct.kind === "http_error") {
        throw new Error(`HTTP ${direct.status}: 获取 ${path} 失败`)
      }
      throw new Error(response?.error || `获取 ${path} 失败`)
    }

    return response.data as T
  }
}

const PORTUNEX_API_ORIGIN = "https://api.portunex.gewulabs.group"

function normalizeSiteUrl(siteUrl: string): string {
  return (siteUrl || "").trim().replace(/\/+$/, "")
}

function normalizeBearerToken(token?: string): string {
  let raw = (token || "").trim()
  if (!raw) return ""

  // 兼容用户从 DevTools 直接复制整行 Header 的情况
  raw = raw.replace(/^authorization\\s*:\\s*/i, "").trim()

  // 去除包裹引号
  raw = raw.replace(/^["']+|["']+$/g, "").trim()

  const bearerMatch = raw.match(/^bearer\\s+(.+)$/i)
  if (bearerMatch) {
    return (bearerMatch[1] || "").trim().replace(/^["']+|["']+$/g, "").trim()
  }

  return raw
}
