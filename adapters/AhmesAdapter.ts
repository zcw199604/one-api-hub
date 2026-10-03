import type { ISiteAdapter } from "./ISiteAdapter"
import { AdapterCapability, type AutoDetectResult, type BalanceInfo, type SiteCredentials, type SiteStatusInfo, type UsageStats, type ValidateResult } from "./types"
import { readAhmesSnapshot } from "../services/ahmesSession"

export class AhmesAdapter implements ISiteAdapter {
  readonly metadata = {
    id: "ahmes", name: "Ahmes", version: "1.0.0", supportedSiteTypes: ["ahmes"],
    capabilities: [AdapterCapability.AUTO_DETECT, AdapterCapability.BALANCE, AdapterCapability.USAGE_STATS],
    balance: { rawUnit: "micro_points", conversionFactor: 1_000_000 }
  } as const

  async getSiteStatus(siteUrl: string): Promise<SiteStatusInfo> {
    try { const url = new URL(siteUrl); return url.hostname === "ahmes.dev" || url.hostname.endsWith(".ahmes.dev") ? { detected: true } : null as any } catch { return null as any }
  }

  async autoDetectAccount(siteUrl: string): Promise<AutoDetectResult> {
    try { const snapshot = await this.fetchSnapshot(siteUrl); const username = this.username(snapshot.me); return username ? { success: true, data: { username, accessToken: "", userId: String(snapshot.me.id || ""), exchangeRate: null } } : { success: false, error: "未获取到 Ahmes 用户信息，请确认已登录" } }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : "自动识别失败" } }
  }

  async validateConnection(credentials: SiteCredentials): Promise<ValidateResult> {
    try { const snapshot = await this.fetchSnapshot(credentials.siteUrl, credentials.adapterConfig?.username); return { ok: true, details: { username: this.username(snapshot.me), id: snapshot.me.id } } }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : "账号校验失败" } }
  }

  async getAccountBalance(credentials: SiteCredentials): Promise<BalanceInfo> {
    const snapshot = await this.fetchSnapshot(credentials.siteUrl, credentials.adapterConfig?.username)
    const raw = snapshot.wallet?.balance_micros
    if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error("Ahmes 钱包余额格式异常")
    return { rawBalance: raw, rawUnit: "micro_points", conversionFactor: 1_000_000, balanceUSD: raw / 1_000_000 }
  }

  async getUsageStats(credentials: SiteCredentials): Promise<UsageStats> {
    const snapshot = await this.fetchSnapshot(credentials.siteUrl, credentials.adapterConfig?.username)
    const today = snapshot.daily[0] || { cost_micros: 0 }
    if (typeof today.cost_micros !== "number" || !Number.isFinite(today.cost_micros)) throw new Error("Ahmes 今日用量格式异常")
    return { rawConsumption: today.cost_micros, rawUnit: "micro_points", conversionFactor: 1_000_000, promptTokens: today.input_tokens ?? 0, completionTokens: today.output_tokens ?? 0, requestCount: today.requests ?? 0 }
  }

  private async fetchSnapshot(siteUrl: string, expectedUsername?: string) {
    if (!siteUrl.trim()) throw new Error("Ahmes 站点地址不能为空")
    const result = await readAhmesSnapshot(new URL(siteUrl).origin)
    if (!result || typeof result.success !== "boolean") throw new Error("插件后台未返回 Ahmes 数据，请重新加载插件后重试")
    if (!result.success || !result.data) throw new Error(result.error || "读取 Ahmes 数据失败")
    const username = this.username(result.data.me)
    if (!username) throw new Error("未获取到 Ahmes 用户信息，请确认已登录")
    if (expectedUsername && username !== expectedUsername) throw new Error("浏览器登录账号已变化，请登录原账号后刷新")
    return result.data
  }

  private username(me: any): string { return typeof me?.email === "string" ? me.email.trim() : "" }
}
