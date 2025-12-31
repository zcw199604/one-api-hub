import type {
  AccessTokenInfo,
  ApiToken,
  AutoDetectResult,
  BalanceInfo,
  ModelInfo,
  PaginationParams,
  PricingInfo,
  SiteAdapterMetadata,
  SiteCredentials,
  SiteStatusInfo,
  TimeRange,
  UsageStats,
  ValidateResult
} from "./types"

export interface ISiteAdapter {
  readonly metadata: SiteAdapterMetadata

  validateConnection(credentials: SiteCredentials): Promise<ValidateResult>

  getAccountBalance?(credentials: SiteCredentials): Promise<BalanceInfo>
  getUsageStats?(credentials: SiteCredentials, timeRange: TimeRange): Promise<UsageStats>

  autoDetectAccount?(siteUrl: string): Promise<AutoDetectResult>
  getOrCreateAccessToken?(credentials: SiteCredentials): Promise<AccessTokenInfo>

  getApiTokens?(credentials: SiteCredentials, pagination?: PaginationParams): Promise<ApiToken[]>
  createApiToken?(credentials: SiteCredentials, tokenConfig: any): Promise<boolean>
  updateApiToken?(credentials: SiteCredentials, tokenId: string, tokenConfig: any): Promise<boolean>
  deleteApiToken?(credentials: SiteCredentials, tokenId: string): Promise<boolean>

  getAvailableModels?(credentials: SiteCredentials): Promise<ModelInfo[]>
  getModelPricing?(credentials: SiteCredentials): Promise<PricingInfo>
  getSiteStatus?(siteUrl: string): Promise<SiteStatusInfo>
}

