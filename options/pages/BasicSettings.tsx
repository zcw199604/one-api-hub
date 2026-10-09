import { useState, useEffect } from "react"
import { Switch } from "@headlessui/react"
import { CogIcon, GlobeAltIcon, EyeIcon, ArrowPathIcon } from "@heroicons/react/24/outline"
import { useUserPreferences } from "../../hooks/useUserPreferences"
import toast from 'react-hot-toast'

export default function BasicSettings() {
  const {
    preferences,
    isLoading,
    currencyType,
    activeTab,
    updateCurrencyType,
    updateActiveTab,
    updateAutoRefresh,
    updateRefreshInterval,
    updateRefreshOnOpen,
    resetToDefaults
  } = useUserPreferences()

  // 从偏好设置中获取值，或使用默认值
  const autoRefresh = preferences?.autoRefresh ?? true
  const refreshInterval = preferences?.refreshInterval ?? 360
  const refreshOnOpen = preferences?.refreshOnOpen ?? true

  // 本地状态用于输入框编辑
  const [intervalInput, setIntervalInput] = useState<string>(refreshInterval.toString())

  // 同步刷新间隔值到输入框
  useEffect(() => {
    setIntervalInput(refreshInterval.toString())
  }, [refreshInterval])

  const handleCurrencyChange = async (currency: 'USD' | 'CNY') => {
    const success = await updateCurrencyType(currency)
    if (success) {
      toast.success(`货币单位已切换到 ${currency === 'USD' ? '美元' : '人民币'}`)
    } else {
      toast.error('设置保存失败')
    }
  }

  const handleDefaultTabChange = async (tab: 'consumption' | 'balance' | 'revenue') => {
    const success = await updateActiveTab(tab)
    if (success) {
      toast.success(`默认标签页已设置为 ${tab === 'consumption' ? '今日消耗' : tab === 'revenue' ? '营收统计' : '总余额'}`)
    } else {
      toast.error('设置保存失败')
    }
  }

  const handleAutoRefreshChange = async (enabled: boolean) => {
    const success = await updateAutoRefresh(enabled)
    if (success) {
      // 通知后台更新设置
      chrome.runtime.sendMessage({
        action: 'updateAutoRefreshSettings',
        settings: { autoRefresh: enabled }
      });
      toast.success(`自动刷新已${enabled ? '启用' : '关闭'}`)
    } else {
      toast.error('设置保存失败')
    }
  }

  const handleRefreshIntervalChange = async (value: string) => {
    // 直接更新输入框状态，允许用户清空和编辑
    setIntervalInput(value)
  }

  const handleRefreshIntervalBlur = async () => {
    const interval = Number(intervalInput)
    
    // 验证输入值
    if (!intervalInput || isNaN(interval) || interval < 10) {
      toast.error('刷新间隔必须大于等于10秒')
      setIntervalInput(refreshInterval.toString()) // 恢复原值
      return
    }

    // 保存设置
    const success = await updateRefreshInterval(interval)
    if (success) {
      // 通知后台更新设置
      chrome.runtime.sendMessage({
        action: 'updateAutoRefreshSettings',
        settings: { refreshInterval: interval }
      });
      toast.success(`刷新间隔已设置为 ${interval} 秒`)
    } else {
      toast.error('设置保存失败')
      setIntervalInput(refreshInterval.toString()) // 恢复原值
    }
  }

  const handleRefreshOnOpenChange = async (enabled: boolean) => {
    const success = await updateRefreshOnOpen(enabled)
    if (success) {
      toast.success(`打开插件时自动刷新已${enabled ? '启用' : '关闭'}`)
    } else {
      toast.error('设置保存失败')
    }
  }


  const handleResetToDefaults = async () => {
    if (window.confirm('确定要重置所有设置到默认值吗？此操作不可撤销。')) {
      const success = await resetToDefaults()
      if (success) {
        toast.success('所有设置已重置为默认值')
      } else {
        toast.error('重置失败')
      }
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <CogIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">基本设置</h1>
        </div>
        <p className="text-gray-500">管理插件的基本配置选项</p>
      </div>

      <div className="space-y-8">
        {/* 显示设置 */}
        <section>
          <h2 className="text-lg font-medium text-gray-900 mb-4">显示设置</h2>
          <div className="space-y-6">
            {/* 默认货币单位 */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <GlobeAltIcon className="w-5 h-5 text-gray-400" />
                <div>
                  <h3 className="text-sm font-medium text-gray-900">货币单位</h3>
                  <p className="text-sm text-gray-500">设置余额和消费显示的默认货币单位</p>
                </div>
              </div>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => handleCurrencyChange('USD')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    currencyType === 'USD'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  美元 ($)
                </button>
                <button
                  onClick={() => handleCurrencyChange('CNY')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    currencyType === 'CNY'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  人民币 (¥)
                </button>
              </div>
            </div>

            {/* 默认标签页 */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <EyeIcon className="w-5 h-5 text-gray-400" />
                <div>
                  <h3 className="text-sm font-medium text-gray-900">默认标签页</h3>
                  <p className="text-sm text-gray-500">设置插件启动时显示的默认标签页</p>
                </div>
              </div>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => handleDefaultTabChange('consumption')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'consumption'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  今日消耗
                </button>
                <button
                  onClick={() => handleDefaultTabChange('balance')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'balance'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  总余额
                </button>
                <button onClick={() => handleDefaultTabChange('revenue')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'revenue' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  营收统计
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* 刷新设置 */}
        <section>
          <h2 className="text-lg font-medium text-gray-900 mb-4">刷新设置</h2>
          <div className="space-y-6">
            {/* 自动刷新 */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-medium text-gray-900">自动刷新</h3>
                <p className="text-sm text-gray-500">定期自动刷新账号数据</p>
              </div>
              <Switch
                checked={autoRefresh}
                onChange={handleAutoRefreshChange}
                className={`${
                  autoRefresh ? 'bg-blue-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    autoRefresh ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {/* 刷新间隔 */}
            {autoRefresh && (
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">刷新间隔</h3>
                  <p className="text-sm text-gray-500">设置自动刷新的时间间隔（默认360秒，建议不要设置过小以避免频繁请求）</p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="10"
                    value={intervalInput}
                    onChange={(e) => handleRefreshIntervalChange(e.target.value)}
                    onBlur={handleRefreshIntervalBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur() // 触发onBlur事件
                      }
                    }}
                    placeholder="360"
                    className="w-20 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-sm text-gray-500">秒</span>
                </div>
              </div>
            )}

            {/* 打开插件时自动刷新 */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-medium text-gray-900">打开插件时自动刷新</h3>
                <p className="text-sm text-gray-500">当打开插件弹出层时自动刷新账号数据</p>
              </div>
              <Switch
                checked={refreshOnOpen}
                onChange={handleRefreshOnOpenChange}
                className={`${
                  refreshOnOpen ? 'bg-blue-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    refreshOnOpen ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>
          </div>
        </section>

        {/* 危险操作 */}
        <section>
          <h2 className="text-lg font-medium text-red-600 mb-4">危险操作</h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-red-800">重置所有设置</h3>
                <p className="text-sm text-red-600 mt-1">
                  将所有配置重置为默认值，此操作不可撤销
                </p>
              </div>
              <button
                onClick={handleResetToDefaults}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                重置设置
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
