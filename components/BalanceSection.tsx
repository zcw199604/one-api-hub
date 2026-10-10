import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react"
import { ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline"
import CountUp from "react-countup"
import { UI_CONSTANTS } from "../constants/ui"
import { getCurrencySymbol, formatTokenCount } from "../utils/formatters"
import { useTimeFormatter } from "../hooks/useTimeFormatter"
import Tooltip from "./Tooltip"
import type { BalanceTab, SubscriptionInfo, DisplaySiteData, RevenueView } from "../types"
import { getBalanceTabs, REVENUE_RANGE_PRESETS } from "../utils/siteRevenue"
import type { useRevenueRange } from "../hooks/useRevenueRange"

interface BalanceSectionProps {
  // 金额数据
  totalConsumption: { USD: number; CNY: number }
  totalBalance: { USD: number; CNY: number }
  revenueSites?: DisplaySiteData[]
  revenueView?: RevenueView
  revenueRange: ReturnType<typeof useRevenueRange>

  // 今日消耗拆分（订阅/按量）
  consumptionBreakdown?: {
    subscription: { USD: number; CNY: number }
    payAsYouGo: { USD: number; CNY: number }
  }
  todayTokens: { upload: number; download: number }

  // 状态
  currencyType: 'USD' | 'CNY'
  activeTab: BalanceTab
  isInitialLoad: boolean
  lastUpdateTime: Date

  // 动画相关
  prevTotalConsumption: { USD: number; CNY: number }

  // 订阅信息（可选，仅包月账号有）
  subscription?: SubscriptionInfo

  // 事件处理
  onCurrencyToggle: () => void
  onTabChange: (index: number) => void
}

export default function BalanceSection({
  totalConsumption,
  totalBalance,
  revenueSites = [],
  revenueView,
  revenueRange,
  consumptionBreakdown,
  todayTokens,
  currencyType,
  activeTab,
  isInitialLoad,
  lastUpdateTime,
  prevTotalConsumption,
  subscription,
  onCurrencyToggle,
  onTabChange
}: BalanceSectionProps) {
  const { formatRelativeTime, formatFullTime } = useTimeFormatter()

  const tabs = getBalanceTabs(revenueSites.length > 0, Boolean(subscription))
  const selectedIndex = tabs.includes(activeTab) ? tabs.indexOf(activeTab) : 1
  const isTodayRange = revenueRange.preset === 'today'
  const revenueUpdateTime = isTodayRange
    ? Math.min(...revenueSites.map(site => site.revenueUpdatedAt ?? 0))
    : revenueRange.state.report?.fetchedAt ?? 0
  const displayedUpdateTime = activeTab === 'revenue' && revenueUpdateTime > 0 ? new Date(revenueUpdateTime) : lastUpdateTime
  const rangeLoading = !isTodayRange && revenueRange.state.loading
  const revenueDifference = revenueView
    ? Number((revenueView.revenue.total[currencyType] - revenueView.consumption.total[currencyType]).toFixed(2))
    : 0
  const localRows = revenueView ? [...revenueView.rows, ...revenueView.consumption.rows].filter(row => row.localSince) : []
  const formatAmount = (amount: number) => Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatSignedAmount = (amount: number) =>
    `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${getCurrencySymbol(currencyType)}${formatAmount(amount)}`
  const revenueDifferenceColor = !revenueView || revenueView.revenue.successful === 0 || revenueDifference === 0
    ? 'text-gray-600'
    : revenueDifference > 0 ? 'text-green-700 hover:text-green-800' : 'text-red-700 hover:text-red-800'

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  
  return (
    <div className="px-6 py-6 bg-gradient-to-br from-blue-50/50 to-indigo-50/30">
      <div className="space-y-3">
        {/* 金额标签页 */}
        <div>
          <TabGroup key={tabs.join('-')} selectedIndex={selectedIndex} onChange={onTabChange}>
            <div className="flex justify-start mb-3">
              <TabList className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                <Tab className={({ selected }) =>
                  `px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    selected
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`
                }>
                  今日消耗
                </Tab>
                <Tab className={({ selected }) =>
                  `px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    selected
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`
                }>
                  总余额
                </Tab>
                {revenueSites.length > 0 && (
                  <Tab className={({ selected }) =>
                    `px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`
                  }>
                    营收统计
                  </Tab>
                )}
                {subscription && (
                  <Tab className={({ selected }) =>
                    `px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      selected
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`
                  }>
                    订阅信息
                  </Tab>
                )}
              </TabList>
            </div>
            
            <TabPanels>
              <TabPanel>
                {/* 今日消耗面板 */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onCurrencyToggle}
                    className="text-5xl font-bold text-gray-900 tracking-tight hover:text-blue-600 transition-colors cursor-pointer"
                    title={`点击切换到 ${currencyType === 'USD' ? '人民币' : '美元'}`}
                  >
                    {totalConsumption[currencyType] > 0 ? '-' : ''}{getCurrencySymbol(currencyType)}
                    <CountUp
                      start={isInitialLoad ? 0 : prevTotalConsumption[currencyType]}
                      end={totalConsumption[currencyType]}
                      duration={isInitialLoad ? UI_CONSTANTS.ANIMATION.INITIAL_DURATION : UI_CONSTANTS.ANIMATION.UPDATE_DURATION}
                      decimals={2}
                      preserveValue
                    />
                  </button>
                </div>

                {subscription && consumptionBreakdown && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-white/70 px-3 py-2">
                      <p className="text-xs text-gray-500">订阅套餐</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {consumptionBreakdown.subscription[currencyType] > 0 ? '-' : ''}
                        {getCurrencySymbol(currencyType)}
                        {consumptionBreakdown.subscription[currencyType].toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-md bg-white/70 px-3 py-2">
                      <p className="text-xs text-gray-500">按量付费</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {consumptionBreakdown.payAsYouGo[currencyType] > 0 ? '-' : ''}
                        {getCurrencySymbol(currencyType)}
                        {consumptionBreakdown.payAsYouGo[currencyType].toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </TabPanel>
              
              <TabPanel>
                {/* 总余额面板 */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onCurrencyToggle}
                    className="text-5xl font-bold text-gray-900 tracking-tight hover:text-blue-600 transition-colors cursor-pointer"
                    title={`点击切换到 ${currencyType === 'USD' ? '人民币' : '美元'}`}
                  >
                    {getCurrencySymbol(currencyType)}
                    <CountUp
                      start={isInitialLoad ? 0 : 0}
                      end={totalBalance[currencyType]}
                      duration={isInitialLoad ? UI_CONSTANTS.ANIMATION.INITIAL_DURATION : UI_CONSTANTS.ANIMATION.UPDATE_DURATION}
                      decimals={2}
                      preserveValue
                    />
                  </button>
                </div>
              </TabPanel>

              {revenueSites.length > 0 && (
                <TabPanel>
                  <div role="group" aria-label="统计时间范围" className="mb-3 flex flex-wrap gap-1">
                    {REVENUE_RANGE_PRESETS.map(option => (
                      <button key={option.value} type="button" aria-pressed={revenueRange.preset === option.value}
                        onClick={() => revenueRange.setPreset(option.value)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          revenueRange.preset === option.value ? 'bg-green-600 text-white' : 'bg-white/70 text-gray-600 hover:text-gray-900'
                        }`}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {revenueRange.preset === 'custom' && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-gray-600">
                      <input type="date" aria-label="开始日期" value={revenueRange.custom.start} max={revenueRange.custom.end || undefined}
                        onChange={event => revenueRange.setCustom({ ...revenueRange.custom, start: event.target.value })}
                        className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1" />
                      <span>至</span>
                      <input type="date" aria-label="结束日期" value={revenueRange.custom.end} min={revenueRange.custom.start || undefined}
                        onChange={event => revenueRange.setCustom({ ...revenueRange.custom, end: event.target.value })}
                        className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1" />
                    </div>
                  )}
                  {revenueRange.rangeError ? (
                    <p role="alert" className="text-sm text-amber-700">{revenueRange.rangeError}</p>
                  ) : rangeLoading || !revenueView ? (
                    <p role="status" className="text-sm text-gray-500">
                      {revenueRange.state.error ? `查询失败：${revenueRange.state.error}` : '正在查询所选时间范围…'}
                    </p>
                  ) : (
                    <>
                      <p className="mb-1 text-xs text-gray-500">预计净收益 · {revenueRange.range?.text}</p>
                      <Tooltip className="max-w-[280px] !whitespace-normal" content="预计净收益 = 总流水 - 总消耗；总流水按全站用户消费记录的扣费额度统计，包含管理员本人，不代表实际到账或利润，也未扣除手续费、退款等其他成本。时间按浏览器本地时区、含首尾日期计算。">
                        <button type="button" onClick={onCurrencyToggle}
                          title={`点击切换到 ${currencyType === 'USD' ? '人民币' : '美元'}`}
                          data-testid="revenue-difference"
                          className={`max-w-full break-all text-left text-4xl font-bold transition-colors ${revenueDifferenceColor}`}>
                          {revenueView.revenue.successful > 0
                            ? formatSignedAmount(revenueDifference)
                            : '待计算'}
                        </button>
                      </Tooltip>
                      <dl className="mt-3 space-y-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-sm text-gray-500">总流水</dt>
                          <dd data-testid="revenue-total-flow" className="min-w-0 break-all text-right text-xl font-semibold text-green-700">
                            {revenueView.revenue.successful > 0
                              ? `+${getCurrencySymbol(currencyType)}${formatAmount(revenueView.revenue.total[currencyType])}`
                              : '获取失败'}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-sm text-gray-500">总消耗</dt>
                          <dd className="flex min-w-0 justify-end">
                            <Tooltip position="left" className="w-max max-w-[260px] !whitespace-normal" content={
                              <div className="space-y-1">
                                <div className="font-medium">各站点消耗 / 余额</div>
                                {revenueView.consumption.rows.length === 0 && <div>暂无个人账号</div>}
                                {localRows.length > 0 && <div className="text-gray-300">* 含本地每日记录（站点历史缺失时补足）</div>}
                                {revenueView.consumption.rows.map(row => (
                                  <div key={row.id} className="flex justify-between gap-3">
                                    <span className="min-w-0 break-words">{row.name}</span>
                                    <span className="shrink-0 text-right">
                                      {row.amount && !row.error
                                        ? `-${getCurrencySymbol(currencyType)}${formatAmount(row.amount[currencyType])}${row.localSince ? '*' : ''}`
                                        : '消耗获取失败'}
                                      {row.balance && ` / ${getCurrencySymbol(currencyType)}${formatAmount(row.balance[currencyType])}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            }>
                              <span data-testid="revenue-consumption" className="cursor-help break-all text-right text-xl font-semibold text-red-700">
                                -{getCurrencySymbol(currencyType)}{formatAmount(revenueView.consumption.total[currencyType])}
                              </span>
                            </Tooltip>
                          </dd>
                        </div>
                      </dl>
                      {localRows.length > 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                          带 * 的金额含本地每日记录（站点清理历史日志时补足，记录自 {localRows.map(r => r.localSince!).sort()[0]} 起，更早的缺失无法补回）
                        </p>
                      )}
                      {revenueView.revenue.failed > 0 && (
                        <p className="mt-2 text-xs text-amber-700">{revenueView.revenue.successful > 0 ? '部分统计：' : ''}{revenueView.revenue.failed} 个站点营收未获取</p>
                      )}
                      {revenueView.consumption.failed > 0 && (
                        <div className="mt-2 text-xs text-amber-700">
                          <p>{revenueView.consumption.failed} 个个人账号消耗未获取，总消耗与预计净收益为部分统计：</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 break-words">
                            {revenueView.consumption.rows.filter(row => !row.amount || row.error).map(row => <li key={row.id}>{row.name}：{row.error}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="mt-4 divide-y divide-gray-200/60">
                        {revenueView.rows.map(row => (
                          <div key={row.id} className="flex items-start justify-between gap-3 py-2">
                            <a href={row.baseUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-sm text-gray-700">{row.name}</a>
                            <Tooltip className="max-w-[240px] !whitespace-normal" content={row.error || (row.updatedAt ? formatFullTime(new Date(row.updatedAt)) : '')}>
                              <span className={`inline-block max-w-[160px] break-all text-right text-sm font-medium ${row.amount && !row.error ? 'text-green-700' : 'text-amber-700'}`}>
                                {row.amount && !row.error ? `+${getCurrencySymbol(currencyType)}${row.amount[currencyType].toFixed(2)}${row.localSince ? '*' : ''}` : '获取失败'}
                              </span>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </TabPanel>
              )}

              {subscription && (
                <TabPanel>
                  {/* 订阅信息面板 */}
                  <div className="space-y-3">
                    {/* 到期时间 */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">到期时间</span>
                      <span className={`text-sm font-medium ${
                        subscription.daysRemaining <= 7 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {formatDate(subscription.expireTime)}
                        <span className="ml-1 text-xs">
                          ({subscription.daysRemaining}天后)
                        </span>
                      </span>
                    </div>

                    {/* 订阅状态 */}
                    {subscription.status && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">订阅状态</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          subscription.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {subscription.status === 'active' ? '正常' : '已过期'}
                        </span>
                      </div>
                    )}

                    {/* 套餐名称 */}
                    {subscription.planType && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">套餐</span>
                        <span className="text-sm font-medium text-gray-900">{subscription.planType}</span>
                      </div>
                    )}

                    {/* 每日额度（如果有限制）*/}
                    {subscription.dailyLimit != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">套餐额度</span>
                        <span className="text-sm font-medium">
                          ${(subscription.dailyUsed ?? 0).toFixed(2)} / ${subscription.dailyLimit.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* 即将过期警告 */}
                    {subscription.daysRemaining <= 7 && subscription.daysRemaining > 0 && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-xs text-red-700">
                          ⚠️ 订阅即将在 {subscription.daysRemaining} 天后到期，请及时续费
                        </p>
                      </div>
                    )}

                    {/* 已过期警告 */}
                    {subscription.daysRemaining <= 0 && (
                      <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md">
                        <p className="text-xs text-red-800 font-medium">
                          ❌ 订阅已过期，请尽快续费以继续使用服务
                        </p>
                      </div>
                    )}
                  </div>
                </TabPanel>
              )}
            </TabPanels>
          </TabGroup>
        </div>
        
        {/* Token 统计信息 */}
        {activeTab !== 'revenue' && <div>
          <Tooltip
            content={
              <div>
                <div>提示: {todayTokens.upload.toLocaleString()} tokens</div>
                <div>补全: {todayTokens.download.toLocaleString()} tokens</div>
              </div>
            }
          >
            <div className="flex items-center space-x-3 cursor-help">
              <div className="flex items-center space-x-1">
                <ArrowUpIcon className="w-4 h-4 text-green-500" />
                <span className="font-medium text-gray-500">
                  {formatTokenCount(todayTokens.upload)}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <ArrowDownIcon className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-gray-500">
                  {formatTokenCount(todayTokens.download)}
                </span>
              </div>
            </div>
          </Tooltip>
        </div>}
      </div>
      
      {/* 最后更新时间 */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="ml-2">
          <Tooltip content={formatFullTime(displayedUpdateTime)}>
            <p className="text-xs text-gray-400 cursor-help">
              更新于 {formatRelativeTime(displayedUpdateTime)}
            </p>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
