import type { ApiToken } from "./types"

export interface Sub2ApiKey {
  id: number
  user_id: number
  key: string
  name: string
  group_id: number | null
  group?: { name: string }
  status: "active" | "inactive" | "quota_exhausted" | "expired"
  quota: number
  quota_used: number
  ip_whitelist: string[]
  ip_blacklist: string[]
  expires_at: string | null
  created_at: string
  last_used_at: string | null
  rate_limit_5h: number
  rate_limit_1d: number
  rate_limit_7d: number
}

export interface Sub2ApiKeyInput {
  name?: string
  group_id?: number | null
  quota?: number
  expires_in_days?: number
  expires_at?: string
  status?: "active" | "inactive"
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
}

export interface Sub2ApiKeyUsage {
  today_actual_cost: number
  total_actual_cost: number
}

export function mapSub2ApiKey(key: Sub2ApiKey): ApiToken {
  const timestamp = (value: string | null) => value ? Math.floor(Date.parse(value) / 1000) : -1
  return {
    id: key.id, user_id: key.user_id, key: key.key, name: key.name,
    status: key.status === "active" ? 1 : 2,
    status_label: ({ active: "启用", inactive: "禁用", quota_exhausted: "额度耗尽", expired: "已过期" })[key.status],
    created_time: timestamp(key.created_at), accessed_time: timestamp(key.last_used_at),
    expired_time: timestamp(key.expires_at),
    remain_quota: key.quota === 0 ? -1 : Math.max(0, key.quota - key.quota_used),
    unlimited_quota: key.quota === 0, used_quota: key.quota_used,
    quota_conversion_factor: 1, group: key.group?.name,
    allow_ips: (key.ip_whitelist || []).join(",")
  }
}
