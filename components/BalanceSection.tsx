import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react"
import { ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline"
import CountUp from "react-countup"
import { UI_CONSTANTS } from "../constants/ui"
import { getCurrencySymbol, formatTokenCount } from "../utils/formatters"
import { useTimeFormatter } from "../hooks/useTimeFormatter"
import Tooltip from "./Tooltip"
import type { BalanceTab, SubscriptionInfo, DisplaySiteData } from "../types"
import { getBalanceTabs } from "../utils/siteRevenue"

interface BalanceSectionProps {
  // 金额数据
  totalConsumption: { USD: number; CNY: number }
  totalBalance: { USD: number; CNY: number }
  revenueSites?: DisplaySiteData[]
  revenueSummary?: { total: { USD: number; CNY: number }; successful: number; failed: number }

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
  revenueSummary,
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
  const revenueUpdateTime = Math.min(...revenueSites.map(site => site.revenueUpdatedAt ?? 0))
  const displayedUpdateTime = activeTab === 'revenue' && revenueUpdateTime > 0 ? new Date(revenueUpdateTime) : lastUpdateTime
  const revenueDifference = Number(((revenueSummary?.total[currencyType] ?? 0) - totalConsumption[currencyType]).toFixed(2))
  const formatAmount = (amount: number) => Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
                    今日营收
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

              {revenueSites.length > 0 && revenueSummary && (
                <TabPanel>
                  <Tooltip className="max-w-[280px] !whitespace-normal" content="按全站用户消费记录的扣费额度统计，包含管理员本人；不代表实际到账或利润。今日按浏览器本地时区计算。">
                    <button type="button" onClick={onCurrencyToggle}
                      title={`点击切换到 ${currencyType === 'USD' ? '人民币' : '美元'}`}
                      className="max-w-full break-all text-left text-4xl font-bold text-green-700 transition-colors hover:text-green-800">
                      {revenueSummary.successful > 0
                        ? `+${getCurrencySymbol(currencyType)}${revenueSummary.total[currencyType].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '获取失败'}
                    </button>
                  </Tooltip>
                  <dl className="mt-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-sm text-gray-500">今日消耗</dt>
                      <dd data-testid="revenue-consumption" className="min-w-0 break-all text-right text-xl font-semibold text-red-700">
                        -{getCurrencySymbol(currencyType)}{formatAmount(totalConsumption[currencyType])}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-gray-200/60 pt-2">
                      <dt className="shrink-0 text-sm text-gray-700">{revenueSummary.failed > 0 && revenueSummary.successful > 0 ? '部分差值' : '今日差值'}</dt>
                      <dd data-testid="revenue-difference" className={`min-w-0 break-all text-right text-2xl font-semibold ${
                        revenueSummary.successful === 0 || revenueDifference === 0 ? 'text-gray-600' : revenueDifference > 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {revenueSummary.successful > 0
                          ? `${revenueDifference > 0 ? '+' : revenueDifference < 0 ? '-' : ''}${getCurrencySymbol(currencyType)}${formatAmount(revenueDifference)}`
                          : '待计算'}
                      </dd>
                    </div>
                  </dl>
                  {revenueSummary.failed > 0 && (
                    <p className="mt-2 text-xs text-amber-700">{revenueSummary.successful > 0 ? '部分统计：' : ''}{revenueSummary.failed} 个站点营收未获取</p>
                  )}
                  <div className="mt-4 divide-y divide-gray-200/60">
                    {revenueSites.map(site => (
                      <div key={site.id} className="flex items-start justify-between gap-3 py-2">
                        <a href={site.baseUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-sm text-gray-700">{site.name}</a>
                        <Tooltip className="max-w-[240px] !whitespace-normal" content={site.revenueError || (site.revenueUpdatedAt ? formatFullTime(new Date(site.revenueUpdatedAt)) : '')}>
                          <span className={`inline-block max-w-[160px] break-all text-right text-sm font-medium ${site.todayRevenue ? 'text-green-700' : 'text-amber-700'}`}>
                            {site.todayRevenue ? `+${getCurrencySymbol(currencyType)}${site.todayRevenue[currencyType].toFixed(2)}` : '获取失败'}
                          </span>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
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
