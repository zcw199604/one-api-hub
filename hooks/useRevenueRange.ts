import { useEffect, useMemo, useState } from "react"
import { accountStorage } from "../services/accountStorage"
import { getRevenueDate, resolveRevenueRange } from "../utils/siteRevenue"
import type { CustomDateRange, RevenueRangePreset, RevenueRangeReport } from "../types"

// 营收面板的时间范围状态；非「今天」时按范围实时查询（今天沿用已缓存的快照）。
export function useRevenueRange(active: boolean, refreshKey: number) {
  const [preset, setPreset] = useState<RevenueRangePreset>("today")
  const [custom, setCustom] = useState<CustomDateRange>(() => ({ start: getRevenueDate(), end: getRevenueDate() }))
  const [state, setState] = useState<{ loading: boolean; report?: RevenueRangeReport; error?: string }>({ loading: false })

  const { range, error: rangeError } = useMemo(
    () => resolveRevenueRange(preset, custom),
    [preset, custom.start, custom.end]
  )
  const start = range?.start, end = range?.end
  const needsFetch = active && preset !== "today" && start !== undefined && end !== undefined

  useEffect(() => {
    if (!needsFetch) return
    let stale = false
    setState({ loading: true })
    accountStorage.fetchRevenueRangeReport({ start: start!, end: end! })
      .then(report => { if (!stale) setState({ loading: false, report }) })
      .catch(error => { if (!stale) setState({ loading: false, error: error instanceof Error ? error.message : "查询失败" }) })
    return () => { stale = true }
  }, [needsFetch, start, end, refreshKey])

  return { preset, setPreset, custom, setCustom, range, rangeError, state }
}
