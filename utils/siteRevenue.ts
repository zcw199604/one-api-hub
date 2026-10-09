import type {
  BalanceTab, CustomDateRange, DisplaySiteData, Money, RevenueRangePreset, RevenueRangeReport, RevenueRow, RevenueView, SiteAccount
} from "../types"

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
    const key = getSiteKey(site.baseUrl)
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

export function getSiteKey(baseUrl: string) {
  try { return new URL(baseUrl).origin } catch { return baseUrl.replace(/\/+$/, "") }
}

// ---- 时间范围 ----

export const REVENUE_RANGE_PRESETS: { value: RevenueRangePreset; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '近7天' },
  { value: 'month', label: '当月' },
  { value: 'custom', label: '自定义' }
]

export interface ResolvedRevenueRange {
  preset: RevenueRangePreset
  start: number // 秒时间戳
  end: number
  text: string // 如 "10-03 ~ 10-09"
}

const MAX_CUSTOM_DAYS = 366
const DAY_MS = 86_400_000

const parseDateKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return getRevenueDate(date) === value ? date : null
}

// 区间均按浏览器本地时区、含首尾日期；结束时间不会晚于今天结束。
export function resolveRevenueRange(
  preset: RevenueRangePreset, custom: CustomDateRange, now = new Date()
): { range?: ResolvedRevenueRange; error?: string } {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  const todayStart = new Date(y, m, d)
  let startDay: Date
  let endDay = todayStart
  if (preset === 'today') startDay = todayStart
  else if (preset === 'week') startDay = new Date(y, m, d - 6)
  else if (preset === 'month') startDay = new Date(y, m, 1)
  else {
    const start = parseDateKey(custom.start), end = parseDateKey(custom.end)
    if (!start || !end) return { error: "请选择开始和结束日期" }
    if (start > end) return { error: "开始日期不能晚于结束日期" }
    if (start > todayStart) return { error: "开始日期不能晚于今天" }
    startDay = start
    endDay = end > todayStart ? todayStart : end
    if (Math.round((endDay.getTime() - startDay.getTime()) / DAY_MS) + 1 > MAX_CUSTOM_DAYS) {
      return { error: `自定义范围不能超过 ${MAX_CUSTOM_DAYS} 天` }
    }
  }
  const startKey = getRevenueDate(startDay), endKey = getRevenueDate(endDay)
  return { range: {
    preset,
    start: Math.floor(startDay.getTime() / 1000),
    end: Math.floor(new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59).getTime() / 1000),
    text: startKey === endKey ? startKey : `${startKey} ~ ${endKey}`
  } }
}

// ---- 营收面板汇总 ----

const sumMoney = (rows: RevenueRow[]): Money => ({
  USD: rows.reduce((sum, row) => sum + (row.amount?.USD ?? 0), 0),
  CNY: rows.reduce((sum, row) => sum + (row.amount?.CNY ?? 0), 0)
})
const countValid = (rows: RevenueRow[]) => rows.filter(row => row.amount && !row.error).length

export function buildRangeRevenueView(report: RevenueRangeReport, displayData: DisplaySiteData[] = []): RevenueView {
  const balances = new Map(displayData.map(site => [site.id, site.balance]))
  const revenueOk = countValid(report.revenue)
  return {
    revenue: { total: sumMoney(report.revenue.filter(r => !r.error)), successful: revenueOk, failed: report.revenue.length - revenueOk },
    consumption: { total: sumMoney(report.consumption.filter(r => !r.error)), failed: report.consumption.length - countValid(report.consumption),
      rows: report.consumption.map(row => ({ ...row, balance: balances.get(row.id) })) },
    rows: report.revenue
  }
}

// 今天：营收取各站点最新快照，消耗取已缓存的个人账号今日消耗。
export function buildTodayRevenueView(displayData: DisplaySiteData[], consumption: Money): RevenueView {
  const sites = getRevenueSites(displayData)
  const summary = calculateRevenueSummary(displayData)
  return {
    revenue: summary,
    consumption: {
      total: consumption, failed: 0,
      rows: displayData.filter(site => !site.revenueEnabled).map(site => ({
        id: site.id, name: site.name, baseUrl: site.baseUrl, amount: site.todayConsumption, balance: site.balance
      }))
    },
    rows: sites.map(site => ({
      id: site.id, name: site.name, baseUrl: site.baseUrl,
      amount: site.todayRevenue, error: site.revenueError, updatedAt: site.revenueUpdatedAt
    }))
  }
}
