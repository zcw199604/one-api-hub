import type { ISiteAdapter } from "../adapters/ISiteAdapter"
import type { SiteCredentials, TimeRange } from "../adapters/types"
import { SiteAdapterRegistry } from "../adapters/SiteAdapterRegistry"
import type { RevenueRangeReport, RevenueRow, RevenueSnapshot, SiteAccount } from "../types"
import { getRevenueDate, getSiteKey } from "../utils/siteRevenue"
import { sumLedgerRange, type DailyLedger } from "./dailyLedger"

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

const DEFAULT_QUOTA_FACTOR = 500000

export const getQuotaFactor = (adapter: ISiteAdapter) =>
  (adapter.metadata.balance?.conversionFactor ?? 0) > 0 ? adapter.metadata.balance!.conversionFactor : DEFAULT_QUOTA_FACTOR

// 逐账号并行查询指定区间：营收站点按 origin 去重（取最近更新的账号），个人账号查询自身消耗。
export async function fetchRevenueRangeReport(
  accounts: SiteAccount[], range: TimeRange, buildCredentials: (account: SiteAccount) => SiteCredentials,
  ledger: DailyLedger = { personal: {}, revenue: {} }
): Promise<RevenueRangeReport> {
  const startDate = getRevenueDate(new Date(range.start * 1000))
  const endDate = getRevenueDate(new Date(range.end * 1000))
  const registry = SiteAdapterRegistry.getInstance()
  const latestBySite = new Map<string, SiteAccount>()
  for (const account of accounts.filter(a => a.revenue_enabled)) {
    const key = getSiteKey(account.site_url)
    const previous = latestBySite.get(key)
    if (!previous || account.updated_at > previous.updated_at) latestBySite.set(key, account)
  }

  // 站点区间值与本地每日记录取较大者：站点清理日志会使其偏小，本地记录只会漏记不会多记。
  const run = async (account: SiteAccount, kind: "revenue" | "consumption"): Promise<RevenueRow> => {
    const row: RevenueRow = { id: account.id, name: account.site_name, baseUrl: account.site_url }
    const rate = kind === "revenue" ? (account.revenue_exchange_rate ?? 0) : account.exchange_rate
    const local = kind === "revenue"
      ? sumLedgerRange(ledger.revenue[getSiteKey(account.site_url)], startDate, endDate)
      : sumLedgerRange(ledger.personal[account.id], startDate, endDate)
    let siteUsd: number | undefined
    let failure = ""
    try {
      const adapter = registry.getAdapter((account.site_type ?? "one-api").toLowerCase())
      if (!adapter) throw new Error("不支持的站点类型")
      const factor = getQuotaFactor(adapter)
      const credentials = buildCredentials(account)
      if (kind === "revenue") {
        if (!adapter.getSiteRevenue) throw new Error("当前站点不支持营收统计")
        siteUsd = (await adapter.getSiteRevenue(credentials, range)).rawQuota / factor
      } else {
        if (!adapter.getRangeUsageStats) throw new Error("该站点暂不支持按时间范围统计消耗")
        siteUsd = (await adapter.getRangeUsageStats(credentials, range)).rawConsumption / factor
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "获取失败"
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ...row, error: kind === "revenue" ? "营收折算比例异常，请编辑账号" : "充值比例异常，请编辑账号" }
    }
    const useLocal = local.count > 0 && (siteUsd === undefined || local.usd > siteUsd)
    const usd = useLocal ? local.usd : siteUsd
    if (usd === undefined) return { ...row, error: failure }
    return { ...row, amount: { USD: usd, CNY: usd * rate }, ...(useLocal ? { localSince: local.since } : {}) }
  }

  const [revenue, consumption] = await Promise.all([
    Promise.all([...latestBySite.values()].map(a => run(a, "revenue"))),
    Promise.all(accounts.filter(a => !a.revenue_enabled).map(a => run(a, "consumption")))
  ])
  return { revenue, consumption, fetchedAt: Date.now() }
}
