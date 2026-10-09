import type { BalanceTab, DisplaySiteData, SiteAccount } from "../types"

export const getRevenueDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

export function getDisplayRevenue(account: SiteAccount, factor: number) {
  if (!account.revenue_enabled) return {}
  const snapshot = account.revenue
  const base = { revenueEnabled: true, revenueUpdatedAt: snapshot?.updatedAt }
  if (!snapshot || snapshot.date !== getRevenueDate()) return { ...base, revenueError: "待刷新今日营收" }
  if (snapshot.error) return { ...base, revenueError: snapshot.error }
  if (typeof snapshot.rawQuota !== "number" || !Number.isFinite(snapshot.rawQuota) || snapshot.rawQuota < 0 ||
      !account.revenue_exchange_rate || !Number.isFinite(account.revenue_exchange_rate) || account.revenue_exchange_rate <= 0) {
    return { ...base, revenueError: "营收数据或折算比例异常，请编辑账号" }
  }
  return { ...base, todayRevenue: {
    USD: snapshot.rawQuota / factor,
    CNY: snapshot.rawQuota / factor * account.revenue_exchange_rate
  } }
}

export function getRevenueSites(sites: DisplaySiteData[]) {
  const unique = new Map<string, DisplaySiteData>()
  for (const site of sites) {
    if (!site.revenueEnabled) continue
    let key = site.baseUrl.replace(/\/+$/, "")
    try { key = new URL(site.baseUrl).origin } catch { /* retain stored URL */ }
    const previous = unique.get(key)
    if (!previous || (site.revenueUpdatedAt ?? 0) > (previous.revenueUpdatedAt ?? 0)) unique.set(key, site)
  }
  return [...unique.values()]
}

export function calculateRevenueSummary(sites: DisplaySiteData[]) {
  const unique = getRevenueSites(sites)
  const valid = unique.filter(site => site.todayRevenue && !site.revenueError)
  return {
    total: {
      USD: valid.reduce((sum, site) => sum + site.todayRevenue!.USD, 0),
      CNY: valid.reduce((sum, site) => sum + site.todayRevenue!.CNY, 0)
    },
    successful: valid.length,
    failed: unique.length - valid.length
  }
}

export function getBalanceTabs(hasRevenue: boolean, hasSubscription: boolean): BalanceTab[] {
  return ['consumption', 'balance', ...(hasRevenue ? ['revenue' as const] : []),
    ...(hasSubscription ? ['subscription' as const] : [])]
}
