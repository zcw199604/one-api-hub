import { SiteAdapterRegistry } from "../adapters/SiteAdapterRegistry"
import { AdapterCapability, type SiteCredentials, type TimeRange } from "../adapters/types"
import type { SiteAccount } from "../types"
import { accountStorage } from "./accountStorage"
import { analyzeAutoDetectError, type AutoDetectError } from "../utils/autoDetectUtils"
import { determineHealthStatus } from "./apiService"

// 对齐现有 accountOperations 的返回结构（便于向后兼容）
export interface AccountValidationResult {
  success: boolean
  data?: {
    username: string
    accessToken: string
    userId: string
    exchangeRate?: number | null
    siteType?: string
  }
  error?: string
  detailedError?: AutoDetectError
}

export interface AccountSaveResult {
  success: boolean
  accountId?: string
  error?: string
}

export interface ValidateAndSaveParams {
  siteType?: string
  url: string
  siteName: string
  username: string
  accessToken?: string
  userId?: string
  apiKey?: string
  exchangeRate: string
}

export class AccountManager {
  private static instance: AccountManager | null = null

  private readonly registry = SiteAdapterRegistry.getInstance()

  static getInstance(): AccountManager {
    if (!AccountManager.instance) {
      AccountManager.instance = new AccountManager()
    }
    return AccountManager.instance
  }

  async autoDetectAccount(siteUrl: string, siteType?: string): Promise<AccountValidationResult> {
    if (!siteUrl.trim()) {
      return { success: false, error: "站点地址不能为空" }
    }

    const normalizedSiteType = (siteType?.trim() || "").toLowerCase()
    const resolvedSiteType =
      normalizedSiteType && normalizedSiteType !== "auto"
        ? normalizedSiteType
        : (await this.registry.detectSiteType(siteUrl.trim())) || "one-api"

    const adapter = this.registry.getAdapter(resolvedSiteType)
    if (!adapter) {
      return { success: false, error: `不支持的站点类型: ${resolvedSiteType}` }
    }

    if (!adapter.metadata.capabilities.includes(AdapterCapability.AUTO_DETECT) || !adapter.autoDetectAccount) {
      return { success: false, error: `站点类型 '${resolvedSiteType}' 不支持自动识别` }
    }

    try {
      const result = await adapter.autoDetectAccount(siteUrl.trim())
      if (!result.success) {
        return {
          success: false,
          error: result.error || "自动检测失败",
          detailedError: result.detailedError ?? analyzeAutoDetectError(result.error || "自动检测失败")
        }
      }
      return {
        success: true,
        data: result.data ? { ...result.data, siteType: resolvedSiteType } : undefined
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

  async validateAndSaveAccount(params: ValidateAndSaveParams): Promise<AccountSaveResult> {
    const siteName = params.siteName.trim()
    const siteUrl = params.url.trim()

    if (!siteUrl || !siteName) {
      return { success: false, error: "请填写完整的账号信息" }
    }

    const resolvedSiteType = await this.resolveSiteType(siteUrl, params.siteType)
    const adapter = this.registry.getAdapter(resolvedSiteType)
    if (!adapter) {
      return { success: false, error: `不支持的站点类型: ${resolvedSiteType}` }
    }

    try {
      const exchangeRate = parseFloat(params.exchangeRate) || 7.2
      const timeRange = this.getTodayTimeRange()

      const { credentials, username, accountInfoSeed } = this.buildCredentialsFromParams(
        adapter.metadata.id,
        siteUrl,
        params
      )

      const validate = await adapter.validateConnection(credentials)
      if (!validate.ok) {
        return { success: false, error: validate.message || "账号连接验证失败" }
      }

      const resolvedUsername =
        username || (validate.details as any)?.username || (validate.details as any)?.user?.username || ""
      if (!resolvedUsername) {
        return { success: false, error: "未获取到用户名，请先登录站点或手动填写用户名" }
      }

      const [balance, usage] = await Promise.all([
        adapter.getAccountBalance ? adapter.getAccountBalance(credentials) : Promise.resolve(null),
        adapter.getUsageStats ? adapter.getUsageStats(credentials, timeRange) : Promise.resolve(null)
      ])

      const accountData: Omit<SiteAccount, "id" | "created_at" | "updated_at"> = {
        emoji: "", // 不再使用 emoji
        site_name: siteName,
        site_url: siteUrl,
        health_status: "healthy",
        exchange_rate: exchangeRate,
        site_type: resolvedSiteType,
        adapter_config: {},
        account_info: {
          ...accountInfoSeed,
          username: resolvedUsername,
          quota: balance?.rawBalance ?? 0,
          today_prompt_tokens: usage?.promptTokens ?? 0,
          today_completion_tokens: usage?.completionTokens ?? 0,
          today_quota_consumption: usage?.rawConsumption ?? 0,
          today_requests_count: usage?.requestCount ?? 0
        },
        last_sync_time: Date.now()
      }

      const accountId = await accountStorage.addAccount(accountData)
      return { success: true, accountId }
    } catch (error) {
      console.error("保存账号失败:", error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      return { success: false, error: `保存失败: ${errorMessage}` }
    }
  }

  async validateAndUpdateAccount(accountId: string, params: ValidateAndSaveParams): Promise<AccountSaveResult> {
    if (!accountId) {
      return { success: false, error: "账号 ID 不能为空" }
    }

    const siteName = params.siteName.trim()
    const siteUrl = params.url.trim()

    if (!siteUrl || !siteName) {
      return { success: false, error: "请填写完整的账号信息" }
    }

    const resolvedSiteType = await this.resolveSiteType(siteUrl, params.siteType)
    const adapter = this.registry.getAdapter(resolvedSiteType)
    if (!adapter) {
      return { success: false, error: `不支持的站点类型: ${resolvedSiteType}` }
    }

    try {
      const exchangeRate = parseFloat(params.exchangeRate) || 7.2
      const timeRange = this.getTodayTimeRange()

      const { credentials, username, accountInfoSeed } = this.buildCredentialsFromParams(
        adapter.metadata.id,
        siteUrl,
        params
      )

      const validate = await adapter.validateConnection(credentials)
      if (!validate.ok) {
        return { success: false, error: validate.message || "账号连接验证失败" }
      }

      const resolvedUsername =
        username || (validate.details as any)?.username || (validate.details as any)?.user?.username || ""
      if (!resolvedUsername) {
        return { success: false, error: "未获取到用户名，请先登录站点或手动填写用户名" }
      }

      const [balance, usage] = await Promise.all([
        adapter.getAccountBalance ? adapter.getAccountBalance(credentials) : Promise.resolve(null),
        adapter.getUsageStats ? adapter.getUsageStats(credentials, timeRange) : Promise.resolve(null)
      ])

      const updateData: Partial<Omit<SiteAccount, "id" | "created_at">> = {
        site_name: siteName,
        site_url: siteUrl,
        exchange_rate: exchangeRate,
        health_status: "healthy",
        site_type: resolvedSiteType,
        account_info: {
          ...accountInfoSeed,
          username: resolvedUsername,
          quota: balance?.rawBalance ?? 0,
          today_prompt_tokens: usage?.promptTokens ?? 0,
          today_completion_tokens: usage?.completionTokens ?? 0,
          today_quota_consumption: usage?.rawConsumption ?? 0,
          today_requests_count: usage?.requestCount ?? 0
        },
        last_sync_time: Date.now()
      }

      const ok = await accountStorage.updateAccount(accountId, updateData)
      return ok ? { success: true, accountId } : { success: false, error: "更新账号失败" }
    } catch (error) {
      console.error("更新账号失败:", error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      return { success: false, error: `更新失败: ${errorMessage}` }
    }
  }

  async refreshAccount(accountId: string): Promise<boolean> {
    try {
      const account = await accountStorage.getAccountById(accountId)
      if (!account) {
        throw new Error(`账号 ${accountId} 不存在`)
      }

      const siteType = this.getAccountSiteType(account)
      const adapter = this.registry.getAdapter(siteType)
      if (!adapter) {
        throw new Error(`不支持的站点类型: ${siteType}`)
      }

      const credentials = this.buildCredentialsFromStoredAccount(account)
      const timeRange = this.getTodayTimeRange()

      const [balance, usage] = await Promise.all([
        adapter.getAccountBalance ? adapter.getAccountBalance(credentials) : Promise.resolve(null),
        adapter.getUsageStats ? adapter.getUsageStats(credentials, timeRange) : Promise.resolve(null)
      ])

      const nextInfo: any = { ...account.account_info }
      if (balance) {
        nextInfo.quota = balance.rawBalance
      }
      if (usage) {
        nextInfo.today_quota_consumption = usage.rawConsumption
        nextInfo.today_prompt_tokens = usage.promptTokens ?? 0
        nextInfo.today_completion_tokens = usage.completionTokens ?? 0
        nextInfo.today_requests_count = usage.requestCount ?? 0
      }

      await accountStorage.updateAccount(accountId, {
        health_status: "healthy",
        last_sync_time: Date.now(),
        account_info: nextInfo
      })

      return true
    } catch (error) {
      console.error("刷新账号数据失败:", error)
      const health = determineHealthStatus(error)
      try {
        await accountStorage.updateAccount(accountId, {
          health_status: health.status,
          last_sync_time: Date.now()
        })
      } catch {
        // ignore
      }
      return false
    }
  }

  async refreshAllAccounts(): Promise<{ success: number; failed: number }> {
    const accounts = await accountStorage.getAllAccounts()
    let success = 0
    let failed = 0

    const results = await Promise.allSettled(accounts.map((a) => this.refreshAccount(a.id)))
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) success++
      else failed++
    })

    return { success, failed }
  }

  // ---- private ----

  private getTodayTimeRange(): TimeRange {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = Math.floor(today.getTime() / 1000)

    today.setHours(23, 59, 59, 999)
    const end = Math.floor(today.getTime() / 1000)

    return { start, end }
  }

  private requireOneApiParams(params: ValidateAndSaveParams): { userId: string; accessToken: string } {
    const accessToken = params.accessToken?.trim() || ""
    const userId = params.userId?.trim() || ""
    if (!accessToken || !userId) {
      throw new Error("请填写访问令牌与用户 ID")
    }
    const parsedUserId = Number(userId)
    if (Number.isNaN(parsedUserId)) {
      throw new Error("用户 ID 必须是数字")
    }
    return { userId, accessToken }
  }

  private getAccountSiteType(account: SiteAccount): string {
    return ((account as any).site_type || "one-api").toLowerCase()
  }

  private buildCredentialsFromStoredAccount(account: SiteAccount): SiteCredentials {
    const siteType = this.getAccountSiteType(account)
    if (siteType === "cubence") {
      return {
        siteUrl: account.site_url,
        auth: { kind: "cookie" },
        adapterConfig: (account as any).adapter_config
      }
    }

    const accountInfo: any = account.account_info
    const apiKey = accountInfo.api_key
    if (apiKey) {
      return { siteUrl: account.site_url, auth: { kind: "api-key", apiKey } }
    }

    const userId = Number(account.account_info?.id ?? NaN)
    const accessToken = account.account_info?.access_token
    if (!accessToken || !Number.isFinite(userId)) {
      throw new Error("账号缺少 userId 或 access_token")
    }

    return {
      siteUrl: account.site_url,
      auth: {
        kind: "one-api-token",
        userId,
        accessToken
      },
      adapterConfig: (account as any).adapter_config
    }
  }

  private async resolveSiteType(siteUrl: string, siteType?: string): Promise<string> {
    const normalized = (siteType?.trim() || "").toLowerCase()
    if (normalized && normalized !== "auto") return normalized
    return (await this.registry.detectSiteType(siteUrl)) || "one-api"
  }

  private buildCredentialsFromParams(
    adapterId: string,
    siteUrl: string,
    params: ValidateAndSaveParams
  ): {
    credentials: SiteCredentials
    username: string
    accountInfoSeed: any
  } {
    if (adapterId === "cubence") {
      return {
        credentials: { siteUrl, auth: { kind: "cookie" } },
        username: params.username?.trim() || "",
        accountInfoSeed: {}
      }
    }

    const apiKey = params.apiKey?.trim()
    if (apiKey) {
      return {
        credentials: { siteUrl, auth: { kind: "api-key", apiKey } },
        username: params.username?.trim() || "",
        accountInfoSeed: { api_key: apiKey }
      }
    }

    const { userId, accessToken } = this.requireOneApiParams(params)
    const parsedUserId = Number(userId)
    return {
      credentials: {
        siteUrl,
        auth: { kind: "one-api-token", userId: parsedUserId, accessToken: accessToken.trim() }
      },
      username: params.username?.trim() || "",
      accountInfoSeed: { id: parsedUserId, access_token: accessToken.trim() }
    }
  }
}
