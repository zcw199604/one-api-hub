import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react"
import { ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline"
import CountUp from "react-countup"
import { UI_CONSTANTS } from "../constants/ui"
import { getCurrencySymbol, formatTokenCount } from "../utils/formatters"
import { useTimeFormatter } from "../hooks/useTimeFormatter"
import Tooltip from "./Tooltip"
import type { BalanceTab, SubscriptionInfo } from "../types"

interface BalanceSectionProps {
  // 金额数据
  totalConsumption: { USD: number; CNY: number }
  totalBalance: { USD: number; CNY: number }

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

  const selectedIndex =
    activeTab === 'consumption' ? 0 : activeTab === 'balance' ? 1 : subscription ? 2 : 1

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
          <TabGroup selectedIndex={selectedIndex} onChange={onTabChange}>
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
        <div>
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
        </div>
      </div>
      
      {/* 最后更新时间 */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="ml-2">
          <Tooltip content={formatFullTime(lastUpdateTime)}>
            <p className="text-xs text-gray-400 cursor-help">
              更新于 {formatRelativeTime(lastUpdateTime)}
            </p>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
