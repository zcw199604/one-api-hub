import type { ISiteAdapter } from "./ISiteAdapter"
import { AdapterRegistrationError, NotSupportedError } from "./errors"
import { AdapterCapability } from "./types"
import { CubenceAdapter } from "./CubenceAdapter"
import { OneApiAdapter } from "./OneApiAdapter"

export class SiteAdapterRegistry {
  private static instance: SiteAdapterRegistry | null = null

  private readonly adaptersById = new Map<string, ISiteAdapter>()
  private readonly adaptersBySiteType = new Map<string, ISiteAdapter>()
  private builtInsRegistered = false

  static getInstance(): SiteAdapterRegistry {
    if (!SiteAdapterRegistry.instance) {
      SiteAdapterRegistry.instance = new SiteAdapterRegistry()
    }
    SiteAdapterRegistry.instance.ensureBuiltInAdaptersRegistered()
    return SiteAdapterRegistry.instance
  }

  registerAdapter(adapter: ISiteAdapter): void {
    const adapterId = adapter.metadata.id
    if (!adapterId) {
      throw new AdapterRegistrationError("adapter.metadata.id 不能为空")
    }

    this.assertCapabilitiesImplemented(adapter)

    if (this.adaptersById.has(adapterId)) {
      throw new AdapterRegistrationError(`重复注册 adapter id: ${adapterId}`)
    }

    this.adaptersById.set(adapterId, adapter)

    for (const siteType of adapter.metadata.supportedSiteTypes) {
      const normalized = this.normalizeSiteType(siteType)
      if (this.adaptersBySiteType.has(normalized)) {
        const existing = this.adaptersBySiteType.get(normalized)!
        throw new AdapterRegistrationError(
          `site_type '${normalized}' 已被 '${existing.metadata.id}' 占用，无法重复注册到 '${adapterId}'`
        )
      }
      this.adaptersBySiteType.set(normalized, adapter)
    }
  }

  getAdapter(siteType: string): ISiteAdapter | null {
    const normalized = this.normalizeSiteType(siteType)
    return this.adaptersBySiteType.get(normalized) ?? null
  }

  getAllAdapters(): ISiteAdapter[] {
    return Array.from(this.adaptersById.values())
  }

  getSupportedSiteTypes(): string[] {
    return Array.from(this.adaptersBySiteType.keys()).sort()
  }

  isSiteTypeSupported(siteType: string): boolean {
    return this.getAdapter(siteType) !== null
  }

  async detectSiteType(siteUrl: string): Promise<string | null> {
    const url = this.normalizeSiteUrl(siteUrl)
    const adapters = this.getAllAdapters()

    for (const adapter of adapters) {
      if (!adapter.getSiteStatus) continue
      try {
        const status = await adapter.getSiteStatus(url)
        if (status) {
          return adapter.metadata.id
        }
      } catch {
        // ignore and try next adapter
      }
    }

    return null
  }

  // ---- private ----

  private ensureBuiltInAdaptersRegistered(): void {
    if (this.builtInsRegistered) return
    this.builtInsRegistered = true

    // 内置适配器：编译期引入并注册
    this.registerAdapter(new OneApiAdapter())
    this.registerAdapter(new CubenceAdapter())
  }

  private normalizeSiteType(siteType: string): string {
    return (siteType || "").trim().toLowerCase()
  }

  private normalizeSiteUrl(siteUrl: string): string {
    return (siteUrl || "").trim().replace(/\/+$/, "")
  }

  private assertCapabilitiesImplemented(adapter: ISiteAdapter): void {
    const caps = adapter.metadata.capabilities ?? []

    const has = (cap: AdapterCapability) => caps.includes(cap)

    if (has(AdapterCapability.AUTO_DETECT) && !adapter.autoDetectAccount) {
      throw new AdapterRegistrationError(
        `adapter '${adapter.metadata.id}' 声明了 AUTO_DETECT 但未实现 autoDetectAccount()`
      )
    }

    if (has(AdapterCapability.BALANCE) && !adapter.getAccountBalance) {
      throw new AdapterRegistrationError(
        `adapter '${adapter.metadata.id}' 声明了 BALANCE 但未实现 getAccountBalance()`
      )
    }

    if (has(AdapterCapability.USAGE_STATS) && !adapter.getUsageStats) {
      throw new AdapterRegistrationError(
        `adapter '${adapter.metadata.id}' 声明了 USAGE_STATS 但未实现 getUsageStats()`
      )
    }

    if (has(AdapterCapability.TOKEN_MANAGEMENT)) {
      const missing: string[] = []
      if (!adapter.getApiTokens) missing.push("getApiTokens")
      if (!adapter.createApiToken) missing.push("createApiToken")
      if (!adapter.updateApiToken) missing.push("updateApiToken")
      if (!adapter.deleteApiToken) missing.push("deleteApiToken")
      if (missing.length > 0) {
        throw new AdapterRegistrationError(
          `adapter '${adapter.metadata.id}' 声明了 TOKEN_MANAGEMENT 但未实现: ${missing.join(
            ", "
          )}`
        )
      }
    }

    if (has(AdapterCapability.MODEL_LIST) && !adapter.getAvailableModels) {
      throw new AdapterRegistrationError(
        `adapter '${adapter.metadata.id}' 声明了 MODEL_LIST 但未实现 getAvailableModels()`
      )
    }

    if (has(AdapterCapability.MODEL_PRICING) && !adapter.getModelPricing) {
      throw new AdapterRegistrationError(
        `adapter '${adapter.metadata.id}' 声明了 MODEL_PRICING 但未实现 getModelPricing()`
      )
    }

    // 额外保护：如果实现方选择“不实现方法而抛错”，应该在调用侧用 capabilities 保护；
    // 这里仅对能力声明与方法存在性做校验。
  }
}

export function assertAdapterCapability(
  adapter: ISiteAdapter | null,
  capability: AdapterCapability,
  message?: string
): asserts adapter is ISiteAdapter {
  if (!adapter) {
    throw new NotSupportedError(message ?? "未找到对应适配器")
  }
  if (!adapter.metadata.capabilities.includes(capability)) {
    throw new NotSupportedError(
      message ?? `适配器 '${adapter.metadata.id}' 不支持能力: ${capability}`
    )
  }
}
