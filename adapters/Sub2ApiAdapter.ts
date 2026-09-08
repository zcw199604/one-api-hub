// Sub2API 站点适配器：通过用户面板 JWT 获取账号、余额和今日用量。
import type { ISiteAdapter } from "./ISiteAdapter"
import { mapSub2ApiKey, type Sub2ApiKey, type Sub2ApiKeyInput, type Sub2ApiKeyUsage } from "./sub2apiKeys"
import {
  AdapterCapability,
  type ApiToken,
  type PaginationParams,
  type AutoDetectResult,
  type BalanceInfo,
  type SiteCredentials,
  type SiteStatusInfo,
  type UsageStats,
  type ValidateResult
} from "./types"

interface Sub2ApiUserProfile {
  id?: number
  email?: string
  username?: string
  balance?: number
  status?: string
}

interface Sub2ApiDashboardStats {
  today_actual_cost?: number
  today_input_tokens?: number
  today_output_tokens?: number
  today_requests?: number
}

interface Sub2ApiPublicSettings {
  site_name?: string
  version?: string
  server_timezone?: string
  available_channels_enabled?: boolean
}

interface Sub2ApiResponse<T> {
  code?: number
  message?: string
  data?: T
}

export class Sub2ApiAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "sub2api",
    name: "Sub2API",
    version: "1.0.0",
    supportedSiteTypes: ["sub2api"],
    capabilities: [
      AdapterCapability.AUTO_DETECT,
      AdapterCapability.BALANCE,
      AdapterCapability.USAGE_STATS,
      AdapterCapability.TOKEN_MANAGEMENT
    ],
    balance: {
      rawUnit: "USD",
      conversionFactor: 1
    }
  } as const

  async validateConnection(
    credentials: SiteCredentials
  ): Promise<ValidateResult> {
    if (credentials.auth.kind !== "api-key") {
      return {
        ok: false,
        message: "Sub2API 适配器需要用户面板 JWT（Bearer Token）鉴权"
      }
    }

    try {
      const profile = await this.fetchProfile(
        credentials.siteUrl,
        credentials.auth.apiKey
      )
      const username = profile.username?.trim() || profile.email?.trim() || ""
      if (!username) {
        return {
          ok: false,
          message: "未获取到用户信息，Token 可能无效或已过期"
        }
      }
      if (profile.status && profile.status !== "active") {
        return {
          ok: false,
          message: `账号状态不可用（status=${profile.status}）`
        }
      }

      return {
        ok: true,
        details: { username, id: profile.id, email: profile.email }
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Sub2API 连接验证失败"
      }
    }
  }

  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    if (credentials.auth.kind !== "api-key") {
      throw new Error("Sub2API 适配器需要用户面板 JWT（Bearer Token）鉴权")
    }

    const profile = await this.fetchProfile(
      credentials.siteUrl,
      credentials.auth.apiKey
    )
    const balance = finiteNumberOrZero(profile.balance)

    return {
      rawBalance: balance,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      balanceUSD: balance
    }
  }

  async getUsageStats(credentials: SiteCredentials): Promise<UsageStats> {
    if (credentials.auth.kind !== "api-key") {
      throw new Error("Sub2API 适配器需要用户面板 JWT（Bearer Token）鉴权")
    }

    const stats = await this.fetchAuthenticated<Sub2ApiDashboardStats>(
      credentials.siteUrl,
      "/api/v1/usage/dashboard/stats",
      credentials.auth.apiKey
    )

    return {
      rawConsumption: finiteNumberOrZero(stats.today_actual_cost),
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      promptTokens: finiteNumberOrZero(stats.today_input_tokens),
      completionTokens: finiteNumberOrZero(stats.today_output_tokens),
      requestCount: finiteNumberOrZero(stats.today_requests)
    }
  }

  async autoDetectAccount(siteUrl: string): Promise<AutoDetectResult> {
    if (!siteUrl.trim()) {
      return { success: false, error: "站点地址不能为空" }
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: "autoDetectSite",
        url: siteUrl.trim(),
        requestId: `sub2api-auto-detect-${Date.now()}`
      })
      if (!response?.success) {
        return {
          success: false,
          error: response?.error || "Sub2API 自动识别失败"
        }
      }

      const token = normalizeBearerToken(response.data?.authToken || "")
      if (!token) {
        return {
          success: false,
          error: "未找到 auth_token，请先在 Sub2API 站点登录"
        }
      }

      const profile = await this.fetchProfile(siteUrl, token)
      const username = profile.username?.trim() || profile.email?.trim() || ""
      if (!username) {
        return { success: false, error: "未获取到 Sub2API 用户信息" }
      }

      return {
        success: true,
        data: {
          username,
          accessToken: token,
          userId: typeof profile.id === "number" ? String(profile.id) : "",
          exchangeRate: null
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Sub2API 自动识别失败"
      }
    }
  }

  async getSiteStatus(siteUrl: string): Promise<SiteStatusInfo> {
    try {
      const baseUrl = normalizeSiteUrl(siteUrl)
      const response = await fetch(
        new URL("/api/v1/settings/public", `${baseUrl}/`).toString(),
        {
          method: "GET",
          credentials: "omit",
          headers: { Accept: "application/json" }
        }
      )
      if (!response.ok) return null as any

      const payload =
        (await response.json()) as Sub2ApiResponse<Sub2ApiPublicSettings>
      const settings = payload.data
      const detected =
        payload.code === 0 &&
        !!settings &&
        typeof settings.site_name === "string" &&
        typeof settings.version === "string" &&
        typeof settings.server_timezone === "string" &&
        typeof settings.available_channels_enabled === "boolean"

      return detected
        ? { detected: true, siteName: settings.site_name }
        : (null as any)
    } catch {
      return null as any
    }
  }

  async getApiTokens(credentials: SiteCredentials, pagination?: PaginationParams): Promise<ApiToken[]> {
    const pageSize = Math.min(100, Math.max(1, pagination?.pageSize ?? 100))
    let page = (pagination?.page ?? 0) + 1
    const keys: ApiToken[] = []
    while (true) {
      const data = await this.keyRequest<{ items: Sub2ApiKey[]; total: number }>(
        credentials, `/keys?page=${page}&page_size=${pageSize}`
      )
      if (!Array.isArray(data.items)) throw new Error("Sub2API 密钥列表响应异常")
      keys.push(...data.items.map(mapSub2ApiKey))
      if (pagination || data.items.length < pageSize || keys.length >= data.total) return keys
      page++
    }
  }

  async getKey(credentials: SiteCredentials, id: string): Promise<Sub2ApiKey> {
    return this.keyRequest(credentials, `/keys/${this.keyId(id)}`)
  }

  async getKeyGroups(credentials: SiteCredentials): Promise<{ id: number; name: string }[]> {
    return this.keyRequest(credentials, "/groups/available")
  }

  async getKeysUsage(credentials: SiteCredentials, ids: number[]): Promise<Record<string, Sub2ApiKeyUsage>> {
    const stats: Record<string, Sub2ApiKeyUsage> = {}
    for (let start = 0; start < ids.length; start += 100) {
      const data = await this.keyRequest<{ stats: Record<string, Sub2ApiKeyUsage> }>(
        credentials, "/usage/dashboard/api-keys-usage", "POST", { api_key_ids: ids.slice(start, start + 100) }
      )
      Object.assign(stats, data.stats)
    }
    return stats
  }

  async createApiToken(credentials: SiteCredentials, config: Sub2ApiKeyInput): Promise<boolean> {
    await this.keyRequest(credentials, "/keys", "POST", config)
    return true
  }

  async updateApiToken(credentials: SiteCredentials, id: string, config: Sub2ApiKeyInput): Promise<boolean> {
    await this.keyRequest(credentials, `/keys/${this.keyId(id)}`, "PUT", config)
    return true
  }

  async deleteApiToken(credentials: SiteCredentials, id: string): Promise<boolean> {
    await this.keyRequest(credentials, `/keys/${this.keyId(id)}`, "DELETE")
    return true
  }

  private keyId(id: string): string {
    if (!/^[1-9]\d*$/.test(id)) throw new Error("无效的密钥 ID")
    return id
  }

  private keyRequest<T>(credentials: SiteCredentials, path: string, method = "GET", body?: unknown): Promise<T> {
    if (credentials.auth.kind !== "api-key") throw new Error("Sub2API 密钥管理需要用户面板 Token")
    return this.fetchAuthenticated(credentials.siteUrl, `/api/v1${path}`, credentials.auth.apiKey, { method, body })
  }

  private async fetchProfile(
    siteUrl: string,
    token: string
  ): Promise<Sub2ApiUserProfile> {
    return this.fetchAuthenticated<Sub2ApiUserProfile>(
      siteUrl,
      "/api/v1/user/profile",
      token
    )
  }

  private async fetchAuthenticated<T>(
    siteUrl: string,
    path: string,
    token: string,
    options: { method: string; body?: unknown } = { method: "GET" }
  ): Promise<T> {
    const baseUrl = normalizeSiteUrl(siteUrl)
    const fetchUrl = new URL(path, `${baseUrl}/`).toString()
    const normalizedToken = normalizeBearerToken(token)
    if (!normalizedToken) {
      throw new Error("缺少 Sub2API 用户面板 Token")
    }

    const response = await fetch(fetchUrl, {
      method: options.method,
      credentials: "omit",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${normalizedToken}`
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw Object.assign(new Error("Sub2API Token 无效或已过期"), { status: 401 })
      }
      let message = "Sub2API 请求失败"
      try {
        const errorPayload = await response.json()
        if (typeof errorPayload.message === "string" && errorPayload.message) message = errorPayload.message
      } catch { /* response may be a proxy error page */ }
      throw new Error(`HTTP ${response.status}: ${message}`)
    }

    const payload = (await response.json()) as Sub2ApiResponse<T>
    if (payload.code !== 0 || !payload.data) {
      throw new Error(payload.message || "Sub2API 响应格式异常")
    }
    return payload.data
  }
}

function normalizeSiteUrl(siteUrl: string): string {
  return (siteUrl || "").trim().replace(/\/+$/, "")
}

function normalizeBearerToken(token: string): string {
  return (token || "")
    .trim()
    .replace(/^bearer\s+/i, "")
    .trim()
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
