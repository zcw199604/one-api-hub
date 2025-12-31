import type { ISiteAdapter } from "./ISiteAdapter"
import { AdapterCapability, type AutoDetectResult, type BalanceInfo, type SiteCredentials, type UsageStats, type ValidateResult } from "./types"

import {
  createApiToken,
  deleteApiToken,
  extractDefaultExchangeRate,
  fetchAccountQuota,
  fetchAccountTokens,
  fetchAvailableModels,
  fetchModelPricing,
  fetchSiteStatus,
  fetchTodayUsage,
  getOrCreateAccessToken,
  updateApiToken,
  validateAccountConnection
} from "../services/apiService"
import { analyzeAutoDetectError } from "../utils/autoDetectUtils"

export class OneApiAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "one-api",
    name: "OneAPI 系列",
    version: "1.0.0",
    supportedSiteTypes: ["one-api", "new-api", "veloera", "one-hub", "done-hub"],
    capabilities: [
      AdapterCapability.AUTO_DETECT,
      AdapterCapability.BALANCE,
      AdapterCapability.USAGE_STATS,
      AdapterCapability.TOKEN_MANAGEMENT,
      AdapterCapability.MODEL_LIST,
      AdapterCapability.MODEL_PRICING
    ],
    balance: {
      rawUnit: "quota_points",
      conversionFactor: 500000
    }
  } as const

  async validateConnection(credentials: SiteCredentials): Promise<ValidateResult> {
    if (credentials.auth.kind !== "one-api-token") {
      return { ok: false, message: "one-api 适配器需要 one-api-token 鉴权" }
    }

    const ok = await validateAccountConnection(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken
    )
    return ok ? { ok: true } : { ok: false, message: "账号连接验证失败" }
  }

  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }

    const rawQuota = await fetchAccountQuota(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken
    )

    return {
      rawBalance: rawQuota,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      balanceUSD: rawQuota / this.metadata.balance.conversionFactor
    }
  }

  async getUsageStats(credentials: SiteCredentials): Promise<UsageStats> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }

    // 目前 UI 仅展示“今日”，先复用现有的 fetchTodayUsage
    const raw = await fetchTodayUsage(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken
    )

    return {
      rawConsumption: raw.today_quota_consumption,
      rawUnit: this.metadata.balance.rawUnit,
      conversionFactor: this.metadata.balance.conversionFactor,
      promptTokens: raw.today_prompt_tokens,
      completionTokens: raw.today_completion_tokens,
      requestCount: raw.today_requests_count
    }
  }

  async autoDetectAccount(siteUrl: string): Promise<AutoDetectResult> {
    if (!siteUrl.trim()) {
      return { success: false, error: "站点地址不能为空" }
    }

    try {
      const requestId = `auto-detect-${Date.now()}`
      const response = await chrome.runtime.sendMessage({
        action: "autoDetectSite",
        url: siteUrl.trim(),
        requestId
      })

      if (!response.success) {
        const detailedError = analyzeAutoDetectError(response.error || "自动检测失败")
        return {
          success: false,
          error: response.error || "自动检测失败，请手动输入信息或确保已在目标站点登录",
          detailedError
        }
      }

      const userId = response.data.userId
      if (!userId) {
        const detailedError = analyzeAutoDetectError("无法获取用户 ID")
        return { success: false, error: "无法获取用户 ID", detailedError }
      }

      // 并行：获取 token + 站点状态（汇率）
      const [tokenInfo, siteStatus] = await Promise.all([
        getOrCreateAccessToken(siteUrl.trim(), Number(userId)),
        fetchSiteStatus(siteUrl.trim())
      ])

      const { username: detectedUsername, access_token } = tokenInfo
      if (!detectedUsername || !access_token) {
        const detailedError = analyzeAutoDetectError("未能获取到用户名或访问令牌")
        return { success: false, error: "未能获取到用户名或访问令牌", detailedError }
      }

      const defaultExchangeRate = extractDefaultExchangeRate(siteStatus)

      return {
        success: true,
        data: {
          username: detectedUsername,
          accessToken: access_token,
          userId: userId.toString(),
          exchangeRate: defaultExchangeRate
        }
      }
    } catch (error) {
      console.error("自动识别失败:", error)
      const detailedError = analyzeAutoDetectError(error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      return {
        success: false,
        error: `自动识别失败: ${errorMessage}`,
        detailedError
      }
    }
  }

  async getOrCreateAccessToken(credentials: SiteCredentials) {
    if (credentials.auth.kind !== "cookie") {
      throw new Error("getOrCreateAccessToken 需要 cookie 鉴权")
    }
    if (!credentials.auth.userId) {
      throw new Error("cookie 鉴权缺少 userId")
    }

    return await getOrCreateAccessToken(credentials.siteUrl, credentials.auth.userId)
  }

  async getApiTokens(credentials: SiteCredentials, pagination?: { page?: number; pageSize?: number }) {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }
    return await fetchAccountTokens(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken,
      pagination?.page ?? 0,
      pagination?.pageSize ?? 100
    )
  }

  async createApiToken(credentials: SiteCredentials, tokenConfig: any): Promise<boolean> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }
    return await createApiToken(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken,
      tokenConfig
    )
  }

  async updateApiToken(credentials: SiteCredentials, tokenId: string, tokenConfig: any): Promise<boolean> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }
    return await updateApiToken(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken,
      Number(tokenId),
      tokenConfig
    )
  }

  async deleteApiToken(credentials: SiteCredentials, tokenId: string): Promise<boolean> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }
    return await deleteApiToken(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken,
      Number(tokenId)
    )
  }

  async getAvailableModels(credentials: SiteCredentials): Promise<{ name: string }[]> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }
    const models = await fetchAvailableModels(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken
    )
    return models.map((name) => ({ name }))
  }

  async getModelPricing(credentials: SiteCredentials): Promise<any> {
    if (credentials.auth.kind !== "one-api-token") {
      throw new Error("one-api 适配器需要 one-api-token 鉴权")
    }
    return await fetchModelPricing(
      credentials.siteUrl,
      credentials.auth.userId,
      credentials.auth.accessToken
    )
  }

  async getSiteStatus(siteUrl: string): Promise<any> {
    return await fetchSiteStatus(siteUrl)
  }
}

