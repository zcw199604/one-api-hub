import { Storage } from "@plasmohq/storage"
import { getSiteKey } from "../utils/siteRevenue"
import type { RevenueSnapshot, SiteAccount } from "../types"

// 本地每日记账：站点会清理历史使用日志，导致范围统计缺失。
// 每次刷新把「当天已知金额(USD)」按日期存下来，范围查询时用它补足站点缺失的部分。
const STORAGE_KEY = "daily_usage_ledger"
const RETENTION_DAYS = 400

type DayAmounts = Record<string, number>
export interface DailyLedger {
  personal: Record<string, DayAmounts> // 账号 id -> 日期 -> USD 消耗
  revenue: Record<string, DayAmounts> // 站点 origin -> 日期 -> USD 营收
}

const storage = new Storage({ area: "local" })
let queue: Promise<unknown> = Promise.resolve()

const normalize = (value: any): DailyLedger => ({
  personal: value?.personal && typeof value.personal === "object" ? value.personal : {},
  revenue: value?.revenue && typeof value.revenue === "object" ? value.revenue : {}
})

export async function readLedger(): Promise<DailyLedger> {
  try {
    return normalize(await storage.get(STORAGE_KEY))
  } catch {
    return normalize(null)
  }
}

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

// 同一天内累计金额只增不减，取最大值，避免站点中途清理日志把已记录的值冲低。
function writeEntry(ledger: DailyLedger, kind: keyof DailyLedger, key: string, date: string, usd: number) {
  const days = (ledger[kind][key] ??= {})
  if (!(days[date] >= usd)) days[date] = usd
  const cutoff = dateKey(new Date(Date.now() - RETENTION_DAYS * 86_400_000))
  for (const day of Object.keys(days)) if (day < cutoff) delete days[day]
}

function mutateLedger(mutate: (ledger: DailyLedger) => void): Promise<void> {
  const task = async () => {
    const ledger = await readLedger()
    mutate(ledger)
    await storage.set(STORAGE_KEY, ledger)
  }
  const result = queue.then(task, task)
  queue = result.catch(() => undefined)
  return result
}

// 刷新成功后调用：个人账号记消耗，营收站点记营收；任何失败都不应影响刷新结果。
export async function recordRefreshToLedger(input: {
  account: SiteAccount
  factor: number
  date: string
  consumptionRaw?: number | null // 仅当本次刷新确实取到今日用量时传入
  revenue?: RevenueSnapshot | null
}): Promise<void> {
  try {
    const { account, factor, date } = input
    if (!(factor > 0)) return
    if (account.revenue_enabled) {
      const raw = input.revenue?.rawQuota
      if (input.revenue?.error || input.revenue?.date !== date || typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return
      await mutateLedger(ledger => writeEntry(ledger, "revenue", getSiteKey(account.site_url), date, raw / factor))
    } else {
      const raw = input.consumptionRaw
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return
      await mutateLedger(ledger => writeEntry(ledger, "personal", account.id, date, raw / factor))
    }
  } catch (error) {
    console.warn("[Ledger] 记录每日金额失败:", error)
  }
}

export function removeAccountFromLedger(accountId: string): Promise<void> {
  return mutateLedger(ledger => { delete ledger.personal[accountId] }).catch(() => undefined)
}

// 汇总区间内（含首尾）已记录的天数与金额。
export function sumLedgerRange(days: DayAmounts | undefined, startDate: string, endDate: string) {
  let usd = 0, count = 0, first: string | undefined
  for (const [date, amount] of Object.entries(days ?? {})) {
    if (date < startDate || date > endDate || !Number.isFinite(amount)) continue
    usd += amount
    count++
  }
  for (const date of Object.keys(days ?? {})) if (!first || date < first) first = date
  return { usd, count, since: first }
}
