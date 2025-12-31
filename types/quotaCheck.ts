/**
 * 额度检测功能相关类型定义
 */

// API Key 额度检测结果
export interface ApiKeyQuotaInfo {
  balance: number           // 剩余余额（美元）
  usedAmount: number        // 已用金额（美元）
  totalAmount: number       // 总额度（美元）
  isValid: boolean          // key 是否有效
  errorMessage?: string     // 错误信息
}

// 存储的 API Key 配置
export interface SavedApiKey {
  id: string                // 唯一标识 (uuid)
  name: string              // 自定义名称（便于识别）
  baseUrl: string           // API 站点地址
  apiKey: string            // API Key (sk-xxx)
  createdAt: number         // 创建时间戳
  lastCheckedAt?: number    // 上次检测时间
  lastQuotaInfo?: ApiKeyQuotaInfo  // 上次检测结果（缓存）
}

// one-api/new-api billing 接口响应
export interface BillingSubscriptionResponse {
  object: string
  has_payment_method: boolean
  soft_limit_usd: number      // 软限制（美元）- 剩余额度
  hard_limit_usd: number      // 硬限制/总额度（美元）
  system_hard_limit_usd: number
  access_until?: number       // 过期时间戳
}
