import type { ISiteAdapter } from "./ISiteAdapter"
import { AdapterCapability, type AutoDetectResult, type BalanceInfo, type SiteCredentials, type SiteStatusInfo, type UsageStats, type ValidateResult } from "./types"
import { readClaudeCodeHubQuota } from "../services/claudeCodeHubSession"

interface UserQuota {
  userName: string
  userIsEnabled: boolean
  keyIsEnabled: boolean
  userLimitTotalUsd: number | null
  userCurrentTotalUsd: number
  userCurrentDailyUsd: number
}

export class ClaudeCodeHubAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "claude-code-hub", name: "Claude Code Hub", version: "1.0.0",
    supportedSiteTypes: ["claude-code-hub"],
    capabilities: [AdapterCapability.AUTO_DETECT, AdapterCapability.BALANCE, AdapterCapability.USAGE_STATS],
    balance: { rawUnit: "USD", conversionFactor: 1 }
  } as const

  async getSiteStatus(siteUrl: string): Promise<SiteStatusInfo> {
    try {
      const response = await fetch(new URL("/api/actions/openapi.json", siteUrl).toString(), {
        credentials: "omit", signal: AbortSignal.timeout(10000)
      })
      if (!response.ok) return null as any
      const schema = await response.json()
      return schema.info?.title === "Claude Code Hub API" &&
        schema.paths?.["/api/actions/my-usage/getMyQuota"]?.post
        ? { detected: true } : null as any
    } catch { return null as any }
  }

  async autoDetectAccount(siteUrl: string): Promise<AutoDetectResult> {
    try {
      const quota = await this.fetchQuota({ siteUrl, auth: { kind: "cookie" } })
      return { success: true, data: {
        username: quota.userName, accessToken: "", userId: "", exchangeRate: null
      } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "自动识别失败" }
    }
  }

  async validateConnection(credentials: SiteCredentials): Promise<ValidateResult> {
    try {
      const quota = await this.fetchQuota(credentials)
      return { ok: true, details: { username: quota.userName } }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "账号校验失败" }
    }
  }

  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    const quota = await this.fetchQuota(credentials)
    if (typeof quota.userLimitTotalUsd !== "number" || !Number.isFinite(quota.userLimitTotalUsd)) {
      throw new Error("用户总额度未设置，无法计算剩余金额")
    }
    if (typeof quota.userCurrentTotalUsd !== "number" || !Number.isFinite(quota.userCurrentTotalUsd)) {
      throw new Error("用户已用额度格式异常")
    }
    // The existing display layer applies the account's CNY/USD recharge ratio once.
    const remaining = quota.userLimitTotalUsd - quota.userCurrentTotalUsd
    return { rawBalance: remaining, rawUnit: "USD", conversionFactor: 1, balanceUSD: remaining }
  }

  async getUsageStats(credentials: SiteCredentials): Promise<UsageStats> {
    const quota = await this.fetchQuota(credentials)
    if (typeof quota.userCurrentDailyUsd !== "number" || !Number.isFinite(quota.userCurrentDailyUsd) || quota.userCurrentDailyUsd < 0) {
      throw new Error("用户日额度已用金额格式异常")
    }
    return { rawConsumption: quota.userCurrentDailyUsd, rawUnit: "USD", conversionFactor: 1 }
  }

  private async fetchQuota(credentials: SiteCredentials): Promise<UserQuota> {
    if (credentials.auth.kind !== "cookie") throw new Error("Claude Code Hub 需要浏览器登录态")
    const origin = new URL(credentials.siteUrl).origin
    let payload: any
    try {
      const response = await fetch(`${origin}/api/actions/my-usage/getMyQuota`, {
        method: "POST", credentials: "include", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: "{}",
        signal: AbortSignal.timeout(15000)
      })
      if (response.ok) payload = await response.json()
      else if (response.status !== 401 && response.status !== 403) {
        throw Object.assign(new Error(`HTTP ${response.status}: 读取配额失败`), { status: response.status })
      }
    } catch (error) {
      if ((error as { status?: number })?.status) throw error
    }
    if (!payload || ["UNAUTHORIZED", "AUTH_MISSING", "AUTH_INVALID"].includes(payload.errorCode)) {
      const result = await readClaudeCodeHubQuota(origin)
      if (!result || typeof result.success !== "boolean") {
        throw new Error("插件后台未返回配额结果，请在扩展管理页重新加载插件，并关闭旧插件页面后重试")
      }
      if (!result.success) throw new Error(result.error || "插件后台读取配额失败，未返回具体原因")
      payload = result.data
    }
    if (!payload?.ok || !payload.data) throw new Error(payload?.error || "配额响应格式异常")
    const quota = payload.data as UserQuota
    if (typeof quota.userName !== "string" || !quota.userName.trim()) throw new Error("未获取到用户名，请先登录")
    if (quota.userIsEnabled === false || quota.keyIsEnabled === false) throw new Error("账号或登录密钥已禁用")
    const expected = credentials.adapterConfig?.username
    if (expected && expected !== quota.userName) throw new Error("浏览器登录账号已变化，请登录原账号后刷新")
    return quota
  }
}
