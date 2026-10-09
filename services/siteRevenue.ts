import type { ISiteAdapter } from "../adapters/ISiteAdapter"
import type { SiteCredentials, TimeRange } from "../adapters/types"
import type { RevenueSnapshot } from "../types"
import { getRevenueDate } from "../utils/siteRevenue"

export async function fetchRevenueSnapshot(
  adapter: ISiteAdapter, credentials: SiteCredentials, range: TimeRange
): Promise<RevenueSnapshot> {
  const snapshot = { date: getRevenueDate(new Date(range.start * 1000)), updatedAt: Date.now() }
  try {
    if (!adapter.getSiteRevenue) throw new Error("当前站点不支持营收统计")
    const result = await adapter.getSiteRevenue(credentials, range)
    return { ...snapshot, rawQuota: result.rawQuota }
  } catch (error) {
    return { ...snapshot, error: error instanceof Error ? error.message : "营收获取失败" }
  }
}
