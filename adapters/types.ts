export enum AdapterCapability {
  AUTO_DETECT = "AUTO_DETECT",
  BALANCE = "BALANCE",
  USAGE_STATS = "USAGE_STATS",
  TOKEN_MANAGEMENT = "TOKEN_MANAGEMENT",
  MODEL_LIST = "MODEL_LIST",
  MODEL_PRICING = "MODEL_PRICING"
}

export type SiteAuth =
  | { kind: "one-api-token"; userId: number; accessToken: string }
  | { kind: "api-key"; apiKey: string }
  | { kind: "cookie"; userId?: number }

export interface SiteCredentials {
  siteUrl: string
  auth: SiteAuth
  adapterConfig?: Record<string, any>
}

export interface ValidateResult {
  ok: boolean
  message?: string
  details?: any
}

export interface BalanceInfo {
  rawBalance: number
  rawUnit: string
  conversionFactor?: number
  balanceUSD?: number
}

export interface UsageStats {
  rawConsumption: number
  rawUnit: string
  conversionFactor?: number
  promptTokens?: number
  completionTokens?: number
  requestCount?: number
}

export interface TimeRange {
  start: number
  end: number
}

export interface AutoDetectResult {
  success: boolean
  data?: {
    username: string
    accessToken: string
    userId: string
    exchangeRate?: number | null
  }
  error?: string
  detailedError?: any
}

export interface SiteAdapterMetadata {
  id: string
  name: string
  version: string
  supportedSiteTypes: readonly string[]
  capabilities: readonly AdapterCapability[]
  balance?: {
    rawUnit: string
    conversionFactor: number
  }
}

export interface AccessTokenInfo {
  username: string
  access_token: string
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface ApiToken {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  model_limits_enabled?: boolean
  model_limits?: string
  allow_ips?: string
  used_quota: number
  group?: string
  DeletedAt?: null
  models?: string
}

export interface ModelInfo {
  id?: string
  name: string
}

export interface PricingInfo {
  // 预留：不同站点定价结构差异很大，先由适配器自行定义并通过 UI/调用方约定解析
  [key: string]: any
}

export interface SiteStatusInfo {
  [key: string]: any
}
