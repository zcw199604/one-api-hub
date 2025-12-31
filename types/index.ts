// 账号信息数据类型定义

// 站点健康状态
export type SiteHealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

// 账号基础信息
export interface AccountInfo {
  id?: number | string; // 账号 ID（one-api 为 userId；其他站点可能没有或为字符串）
  access_token?: string;
  api_key?: string;
  username?: string;
  quota: number; // 总余额点数
  today_prompt_tokens: number; // 今日 prompt_tokens
  today_completion_tokens: number; // 今日 completion_tokens
  today_quota_consumption: number; // 今日消耗 quota
  today_requests_count: number; // 今日请求次数
  extra?: Record<string, any>; // 适配器扩展字段（可选）
}

// 站点账号完整信息
export interface SiteAccount {
  id: string; // 此项 id
  emoji: string; // 此项 emoji
  site_name: string; // 站点名称
  site_url: string; // 站点 url
  site_type?: string; // 站点类型（适配器路由）
  adapter_config?: Record<string, any>; // 适配器配置（可选）
  health_status: SiteHealthStatus; // 站点健康状态
  exchange_rate: number; // 人民币与美元充值比例 (CNY per USD)
  account_info: AccountInfo; // 账号信息
  last_sync_time: number; // 最后同步时间 (timestamp)
  updated_at: number; // 更改时间 (timestamp)
  created_at: number; // 创建时间 (timestamp)
}

// 存储配置
export interface StorageConfig {
  accounts: SiteAccount[];
  last_updated: number;
}

// 账号统计信息 (用于展示)
export interface AccountStats {
  total_quota: number;
  today_total_consumption: number;
  today_total_requests: number;
  today_total_prompt_tokens: number;
  today_total_completion_tokens: number;
}

// API 响应相关类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}

// 用于排序的字段类型
export type SortField = 'site_name' | 'quota' | 'today_quota_consumption' | 'last_sync_time';
export type SortOrder = 'asc' | 'desc';

// 货币类型
export type CurrencyType = 'USD' | 'CNY';

// 展示用的站点数据 (兼容当前 UI)
export interface DisplaySiteData {
  id: string;
  icon: string;
  name: string;
  username: string;
  siteType: string; // 站点类型（用于能力判断/路由到适配器）
  balance: { USD: number; CNY: number };
  todayConsumption: { USD: number; CNY: number };
  todayTokens: { upload: number; download: number };
  healthStatus?: SiteHealthStatus; // 可选的健康状态
  baseUrl: string; // 站点 URL，用于复制功能
  token: string; // 访问令牌，用于复制功能
  userId: number; // 真实的用户 ID，用于 API 调用
}
