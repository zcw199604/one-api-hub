import { useState, useEffect, useMemo, useRef } from "react"
import { 
  CpuChipIcon, 
  MagnifyingGlassIcon, 
  AdjustmentsHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline"
import { Tab } from '@headlessui/react'
import toast from 'react-hot-toast'
import { useAccountData } from "../../hooks/useAccountData"
import { 
  fetchModelPricing, 
  type ModelPricing, 
  type PricingResponse 
} from "../../services/apiService"
import { SiteAdapterRegistry } from "../../adapters/SiteAdapterRegistry"
import { AdapterCapability } from "../../adapters/types"
import {
  getAllProviders,
  filterModelsByProvider,
  getProviderConfig,
  type ProviderType 
} from "../../utils/modelProviders"
import { 
  calculateModelPrice,
  type CalculatedPrice 
} from "../../utils/modelPricing"
import ModelItem from "../../components/ModelItem"

export default function ModelList({ routeParams }: { routeParams?: Record<string, string> }) {
  const { displayData } = useAccountData()
  
  // 状态管理
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProvider, setSelectedProvider] = useState<ProviderType | 'all'>('all')
  const [selectedGroup, setSelectedGroup] = useState<string>('default')
  const [isLoading, setIsLoading] = useState(false)
  
  // 数据状态
  const [pricingData, setPricingData] = useState<PricingResponse | null>(null)
  const [dataFormatError, setDataFormatError] = useState<boolean>(false)
  
  // 显示选项
  const [showRealPrice, setShowRealPrice] = useState(false)
  const [showRatioColumn, setShowRatioColumn] = useState(false)
  const [showEndpointTypes, setShowEndpointTypes] = useState(false)
  
  // 安全获取账号数据
  const safeDisplayData = displayData || []

  const pricingCapableAccounts = useMemo(() => {
    const registry = SiteAdapterRegistry.getInstance()
    return safeDisplayData.filter((acc) =>
      registry.getAdapter(acc.siteType)?.metadata.capabilities.includes(AdapterCapability.MODEL_PRICING)
    )
  }, [safeDisplayData])
  
  // 获取当前选中的账号信息
  const currentAccount = safeDisplayData.find(acc => acc.id === selectedAccount)
  
  // 获取厂商列表
  const providers = getAllProviders()
  
  // Tab滚动相关
  const tabListRef = useRef<HTMLDivElement>(null)
  
  // 自动滚动到选中的Tab
  const scrollToSelectedTab = (selectedIndex: number) => {
    if (!tabListRef.current) return
    
    const tabList = tabListRef.current
    const tabs = tabList.children
    
    if (selectedIndex >= 0 && selectedIndex < tabs.length) {
      const selectedTab = tabs[selectedIndex] as HTMLElement
      const tabListRect = tabList.getBoundingClientRect()
      const selectedTabRect = selectedTab.getBoundingClientRect()
      
      // 计算当前tab相对于容器的位置
      const tabLeft = selectedTabRect.left - tabListRect.left + tabList.scrollLeft
      const tabRight = tabLeft + selectedTabRect.width
      
      // 计算理想的滚动位置（让选中的tab居中显示）
      const containerWidth = tabList.clientWidth
      const idealScrollLeft = tabLeft - (containerWidth / 2) + (selectedTabRect.width / 2)
      
      // 平滑滚动到目标位置
      tabList.scrollTo({
        left: Math.max(0, idealScrollLeft),
        behavior: 'smooth'
      })
    }
  }
  
  // 当选中的厂商改变时，自动滚动到对应位置
  useEffect(() => {
    const selectedIndex = selectedProvider === 'all' ? 0 : Math.max(0, providers.indexOf(selectedProvider as ProviderType) + 1)
    setTimeout(() => scrollToSelectedTab(selectedIndex), 100)
  }, [selectedProvider, providers])
  
  // 加载模型定价数据
  const loadPricingData = async (accountId: string) => {
    const account = safeDisplayData.find(acc => acc.id === accountId)
    if (!account) return
    
    setIsLoading(true)
    setDataFormatError(false)
    try {
      const adapter = SiteAdapterRegistry.getInstance().getAdapter(account.siteType)
      const supportsPricing =
        adapter?.metadata.capabilities.includes(AdapterCapability.MODEL_PRICING) ?? false
      if (!supportsPricing) {
        toast.error("该账号不支持模型定价查询")
        setPricingData(null)
        setDataFormatError(false)
        return
      }

      if (!account.token || !account.userId) {
        toast.error("缺少访问令牌或用户 ID，无法加载模型数据")
        setPricingData(null)
        return
      }

      const data = await fetchModelPricing(account.baseUrl, account.userId, account.token)
      console.log('API 响应数据:', data)
      console.log('模型数据:', data.data)
      console.log('分组比率:', data.group_ratio)
      console.log('可用分组:', data.usable_group)
      
      // 检查数据格式是否正确
      if (!Array.isArray(data.data)) {
        console.error('模型数据格式错误，data 字段不是数组:', data.data)
        setDataFormatError(true)
        setPricingData(null)
        toast.error('当前站点的模型数据格式不符合标准，请手动查看站点定价页面')
        return
      }
      
      setPricingData(data)
      toast.success('模型数据加载成功')
    } catch (error) {
      console.error('加载模型数据失败:', error)
      toast.error('加载模型数据失败，请稍后重试')
      setPricingData(null)
      setDataFormatError(false)
    } finally {
      setIsLoading(false)
    }
  }
  
  // 账号变化时重新加载数据
  useEffect(() => {
    if (selectedAccount) {
      loadPricingData(selectedAccount)
    } else {
      setPricingData(null)
    }
  }, [selectedAccount, safeDisplayData])
  
  // 处理路由参数中的账号ID
  useEffect(() => {
    if (routeParams?.accountId && pricingCapableAccounts.length > 0) {
      // 验证账号ID是否存在
      const accountExists = pricingCapableAccounts.some(acc => acc.id === routeParams.accountId)
      if (accountExists) {
        setSelectedAccount(routeParams.accountId)
      }
    }
  }, [routeParams?.accountId, pricingCapableAccounts])
  
  // 当定价数据加载完成时，自动选择合适的分组
  useEffect(() => {
    if (pricingData && pricingData.group_ratio) {
      const availableGroupsList = Object.keys(pricingData.group_ratio).filter(key => key !== '')
      console.log('分组选择逻辑 - 当前选中分组:', selectedGroup)
      console.log('分组选择逻辑 - 可用分组列表:', availableGroupsList)
      
      // 检查当前选中的分组是否在可用列表中
      if (selectedGroup !== 'all' && !availableGroupsList.includes(selectedGroup)) {
        console.log('分组选择逻辑 - 当前分组不存在，需要重新选择')
        
        if (availableGroupsList.includes('default')) {
          // 如果有default分组，选择default
          console.log('分组选择逻辑 - 选择default分组')
          setSelectedGroup('default')
        } else if (availableGroupsList.length > 0) {
          // 如果没有default但有其他分组，选择第一个
          console.log('分组选择逻辑 - 选择第一个可用分组:', availableGroupsList[0])
          setSelectedGroup(availableGroupsList[0])
        } else {
          // 如果没有任何分组，选择"所有分组"
          console.log('分组选择逻辑 - 没有可用分组，选择所有分组')
          setSelectedGroup('all')
        }
      }
    }
  }, [pricingData, selectedGroup])
  
  // 计算模型价格
  const modelsWithPricing = useMemo(() => {
    console.log('计算模型价格 - pricingData:', pricingData)
    console.log('计算模型价格 - currentAccount:', currentAccount)
    
    if (!pricingData || !currentAccount) {
      console.log('缺少必要数据，返回空数组')
      return []
    }
    
    // 额外的数据安全检查
    if (!Array.isArray(pricingData.data)) {
      console.error('模型数据不是数组格式，无法处理:', pricingData.data)
      return []
    }
    
    console.log('开始处理模型数据，模型数量:', pricingData.data.length)
    
    return pricingData.data.map(model => {
      // 安全的汇率计算
      const exchangeRate = currentAccount?.balance?.USD > 0 
        ? currentAccount.balance.CNY / currentAccount.balance.USD 
        : 7 // 默认汇率
        
      const calculatedPrice = calculateModelPrice(
        model,
        pricingData.group_ratio || {},
        exchangeRate,
        selectedGroup === 'all' ? 'default' : selectedGroup // 根据选中分组计算价格
      )
      
      return {
        model,
        calculatedPrice
      }
    })
  }, [pricingData, currentAccount, selectedGroup])
  
  // 基础过滤模型（不包含厂商过滤，用于Tab数量计算）
  const baseFilteredModels = useMemo(() => {
    console.log('基础过滤模型 - modelsWithPricing:', modelsWithPricing)
    let filtered = modelsWithPricing
    
    // 按分组过滤
    if (selectedGroup !== 'all') {
      console.log('基础过滤-按分组过滤:', selectedGroup)
      
      // 额外的安全检查：确保选中的分组确实存在
      const availableGroupsList = pricingData?.group_ratio ? Object.keys(pricingData.group_ratio).filter(key => key !== '') : []
      if (!availableGroupsList.includes(selectedGroup)) {
        console.warn('基础过滤-警告：选中的分组不存在于可用分组列表中', {
          selectedGroup,
          availableGroups: availableGroupsList
        })
        // 如果选中的分组不存在，不进行分组过滤，显示所有模型
      } else {
        filtered = filtered.filter(item => 
          item.model.enable_groups.includes(selectedGroup)
        )
      }
      console.log('基础过滤-分组过滤后:', filtered.length)
    }
    
    // 搜索过滤
    if (searchTerm) {
      console.log('基础过滤-搜索过滤:', searchTerm)
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(item => 
        item.model.model_name.toLowerCase().includes(searchLower) ||
        (item.model.model_description?.toLowerCase().includes(searchLower) || false)
      )
      console.log('基础过滤-搜索过滤后:', filtered.length)
    }
    
    console.log('基础过滤结果:', filtered)
    return filtered
  }, [modelsWithPricing, selectedGroup, searchTerm, pricingData])

  // 过滤和搜索模型（包含厂商过滤，用于实际显示）
  const filteredModels = useMemo(() => {
    console.log('过滤模型 - baseFilteredModels:', baseFilteredModels)
    let filtered = baseFilteredModels
    
    // 按厂商过滤
    if (selectedProvider !== 'all') {
      console.log('按厂商过滤:', selectedProvider)
      filtered = filtered.filter(item => 
        filterModelsByProvider([item.model], selectedProvider).length > 0
      )
      console.log('厂商过滤后:', filtered.length)
    }
    
    console.log('最终过滤结果:', filtered)
    return filtered
  }, [baseFilteredModels, selectedProvider])
  
  // 处理模型item中的分组点击
  const handleGroupClick = (group: string) => {
    setSelectedGroup(group)
  }
  
  // 计算指定厂商在当前过滤条件下的模型数量
  const getProviderFilteredCount = (provider: ProviderType) => {
    return baseFilteredModels.filter(item => 
      filterModelsByProvider([item.model], provider).length > 0
    ).length
  }
  
  // 获取可用分组列表
  const availableGroups = useMemo(() => {
    console.log('处理可用分组 - pricingData:', pricingData)
    if (!pricingData || !pricingData.group_ratio) {
      console.log('没有分组数据，返回空数组')
      return []
    }
    // 从group_ratio中获取分组，并过滤掉空键
    const groups = Object.keys(pricingData.group_ratio).filter(key => 
      key !== ''
    )
    console.log('原始分组数据:', pricingData.group_ratio)  
    console.log('处理后的分组列表:', groups)
    return groups
  }, [pricingData])

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-2">
          <CpuChipIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">模型列表</h1>
        </div>
        <p className="text-gray-500">查看和管理可用的AI模型</p>
      </div>

      {/* 账号选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择账号
        </label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">请选择账号</option>
          {pricingCapableAccounts.map(account => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </div>

      {/* 如果没有选择账号，显示提示 */}
      {!selectedAccount && (
        <div className="text-center py-12">
          <CpuChipIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">请先选择一个账号查看模型列表</p>
        </div>
      )}

      {/* 加载状态 */}
      {selectedAccount && isLoading && (
        <div className="text-center py-12">
          <ArrowPathIcon className="w-8 h-8 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-500">正在加载模型数据...</p>
        </div>
      )}

      {/* 数据格式错误提示 */}
      {selectedAccount && !isLoading && dataFormatError && currentAccount && (
        <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start space-x-4">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-yellow-800 mb-2">数据格式不兼容</h3>
              <p className="text-yellow-700 mb-4">
                当前站点的模型数据接口返回格式不符合标准规范，可能是经过二次开发的站点。
                插件暂时无法解析该站点的模型定价信息。
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={`${currentAccount.baseUrl}/pricing`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  <span>前往站点查看定价信息</span>
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M17 3l4 4m-5 0l5-5" />
                  </svg>
                </a>
                <button
                  onClick={() => loadPricingData(selectedAccount)}
                  className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  <span>重新尝试加载</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模型数据展示 */}
      {selectedAccount && !isLoading && pricingData && (
        <>
          {/* 控制面板 */}
          <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            {/* 第一行：主要过滤控件 */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              {/* 搜索框 */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  搜索模型
                </label>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="输入模型名称或描述..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 分组筛选 */}
              <div className="w-full lg:w-64">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  用户分组
                </label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">所有分组</option>
                  {availableGroups.map(group => (
                    <option key={group} value={group}>
                      {group} ({pricingData?.group_ratio?.[group] || 1}x)
                    </option>
                  ))}
                </select>
              </div>

              {/* 刷新按钮 */}
              <div className="w-full lg:w-auto">
                <label className="block text-sm font-medium text-gray-700 mb-2 lg:invisible">
                  操作
                </label>
                <button
                  onClick={() => loadPricingData(selectedAccount)}
                  disabled={isLoading}
                  className="w-full lg:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>刷新数据</span>
                </button>
              </div>
            </div>

            {/* 第二行：显示选项和统计信息 */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pt-4 border-t border-gray-100">
              {/* 显示选项 */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <AdjustmentsHorizontalIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700 font-medium">显示选项:</span>
                </div>
                
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRealPrice}
                    onChange={(e) => setShowRealPrice(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>真实充值金额</span>
                </label>
                
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRatioColumn}
                    onChange={(e) => setShowRatioColumn(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>显示倍率</span>
                </label>
                
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showEndpointTypes}
                    onChange={(e) => setShowEndpointTypes(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>端点类型</span>
                </label>
              </div>

              {/* 统计信息 */}
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2 text-gray-600">
                  <CpuChipIcon className="w-4 h-4" />
                  <span>总计 <span className="font-medium text-gray-900">{pricingData?.data?.length || 0}</span> 个模型</span>
                </div>
                <div className="h-4 w-px bg-gray-300"></div>
                <div className="text-blue-600">
                  <span>显示 <span className="font-medium">{filteredModels.length}</span> 个</span>
                </div>
              </div>
            </div>
          </div>

          {/* 厂商 Tabs */}
          <Tab.Group 
            selectedIndex={(() => {
              const index = selectedProvider === 'all' ? 0 : Math.max(0, providers.indexOf(selectedProvider as ProviderType) + 1)
              console.log('当前 selectedProvider:', selectedProvider, '计算的索引:', index)
              return index
            })()}
            onChange={(index) => {
              console.log('Tab 切换到索引:', index)
              if (index === 0) {
                console.log('切换到所有厂商')
                setSelectedProvider('all')
              } else {
                const provider = providers[index - 1]
                console.log('切换到厂商:', provider)
                if (provider) {
                  setSelectedProvider(provider)
                }
              }
              // 滚动到选中的tab
              setTimeout(() => scrollToSelectedTab(index), 50)
            }}
          >
            <Tab.List 
              ref={tabListRef}
              className="flex space-x-1 rounded-xl bg-gray-100 p-1 mb-6 overflow-x-auto overflow-y-hidden scrollbar-hide touch-pan-x"
            >
              <Tab
                className={({ selected }) =>
                  `flex-shrink-0 rounded-lg py-2.5 px-4 text-sm font-medium leading-5 transition-all ${
                    selected
                      ? 'bg-white text-blue-700 shadow'
                      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                  }`
                }
              >
                <div className="flex items-center justify-center space-x-2">
                  <CpuChipIcon className="w-4 h-4" />
                  <span>所有厂商 ({baseFilteredModels.length})</span>
                </div>
              </Tab>
              {providers.map((provider) => {
                // 直接使用 PROVIDER_CONFIGS 获取配置
                const providerConfig = getProviderConfig(
                  provider === 'OpenAI' ? 'gpt-4' :
                  provider === 'Claude' ? 'claude-3' :
                  provider === 'Gemini' ? 'gemini-pro' :
                  provider === 'Grok' ? 'grok' :
                  provider === 'Qwen' ? 'qwen' :
                  provider === 'DeepSeek' ? 'deepseek' :
                  'unknown'
                )
                const IconComponent = providerConfig.icon
                return (
                  <Tab
                    key={provider}
                    className={({ selected }) =>
                      `flex-shrink-0 rounded-lg py-2.5 px-4 text-sm font-medium leading-5 transition-all ${
                        selected
                          ? 'bg-white text-blue-700 shadow'
                          : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                      }`
                    }
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <IconComponent className="w-4 h-4" />
                      <span>{provider} ({getProviderFilteredCount(provider)})</span>
                    </div>
                  </Tab>
                )
              })}
            </Tab.List>

            <Tab.Panels>
              {/* 所有厂商的面板 */}
              <Tab.Panel>
                <div className="space-y-3">
                  {filteredModels.length === 0 ? (
                    <div className="text-center py-12">
                      <CpuChipIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">没有找到匹配的模型</p>
                    </div>
                  ) : (
                    filteredModels.map((item, index) => (
                      <ModelItem
                        key={`${item.model.model_name}-${index}`}
                        model={item.model}
                        calculatedPrice={item.calculatedPrice}
                        exchangeRate={currentAccount?.balance?.USD > 0 ? currentAccount.balance.CNY / currentAccount.balance.USD : 7}
                        showRealPrice={showRealPrice}
                        showRatioColumn={showRatioColumn}
                        showEndpointTypes={showEndpointTypes}
                        userGroup={selectedGroup === 'all' ? 'default' : selectedGroup}
                        onGroupClick={handleGroupClick}
                        availableGroups={availableGroups}
                        isAllGroupsMode={selectedGroup === 'all'}
                      />
                    ))
                  )}
                </div>
              </Tab.Panel>
              
              {/* 为每个厂商创建对应的面板 */}
              {providers.map((provider) => (
                <Tab.Panel key={provider}>
                  <div className="space-y-3">
                    {filteredModels.length === 0 ? (
                      <div className="text-center py-12">
                        <CpuChipIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">没有找到匹配的模型</p>
                      </div>
                    ) : (
                      filteredModels.map((item, index) => (
                        <ModelItem
                          key={`${item.model.model_name}-${index}`}
                          model={item.model}
                          calculatedPrice={item.calculatedPrice}
                          exchangeRate={currentAccount?.balance?.USD > 0 ? currentAccount.balance.CNY / currentAccount.balance.USD : 7}
                          showRealPrice={showRealPrice}
                          showRatioColumn={showRatioColumn}
                          showEndpointTypes={showEndpointTypes}
                          userGroup={selectedGroup === 'all' ? 'default' : selectedGroup}
                          onGroupClick={handleGroupClick}
                          availableGroups={availableGroups}
                          isAllGroupsMode={selectedGroup === 'all'}
                        />
                      ))
                    )}
                  </div>
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </Tab.Group>
        </>
      )}

      {/* 说明文字 */}
      {selectedAccount && pricingData && (
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <CpuChipIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-blue-800 font-medium mb-1">模型定价说明</p>
              <p className="text-blue-700">
                价格信息来源于站点提供的 API 接口，实际费用以各站点公布的价格为准。
                按量计费模型的价格为每 1M tokens 的费用，按次计费模型显示每次调用的费用。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
