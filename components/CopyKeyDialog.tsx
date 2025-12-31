import { Fragment, useState, useEffect } from "react"
import toast from 'react-hot-toast'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react"
import { 
  XMarkIcon, 
  KeyIcon, 
  DocumentDuplicateIcon, 
  ExclamationTriangleIcon,
  CheckIcon,
  ClockIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from "@heroicons/react/24/outline"
import { UI_CONSTANTS } from "../constants/ui"
import { fetchAccountTokens, type ApiToken } from "../services/apiService"
import type { DisplaySiteData } from "../types"
import { SiteAdapterRegistry } from "../adapters/SiteAdapterRegistry"
import { AdapterCapability } from "../adapters/types"

interface CopyKeyDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData | null
}

export default function CopyKeyDialog({ isOpen, onClose, account }: CopyKeyDialogProps) {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [expandedTokens, setExpandedTokens] = useState<Set<number>>(new Set())

  // 获取密钥列表
  const fetchTokens = async () => {
    if (!account) return

    setIsLoading(true)
    setError(null)
    
    try {
      const adapter = SiteAdapterRegistry.getInstance().getAdapter(account.siteType)
      const supportsTokenManagement =
        adapter?.metadata.capabilities.includes(AdapterCapability.TOKEN_MANAGEMENT) ?? false
      if (!supportsTokenManagement) {
        setError("该账号不支持密钥管理")
        setTokens([])
        return
      }

      if (!account.token || !account.userId) {
        setError("缺少访问令牌或用户 ID，无法获取密钥列表")
        setTokens([])
        return
      }

      // 使用 DisplaySiteData 中的 userId 字段
      const tokensResponse = await fetchAccountTokens(account.baseUrl, account.userId, account.token)
      
      // 确保返回的是数组
      if (Array.isArray(tokensResponse)) {
        setTokens(tokensResponse)
      } else {
        console.warn('Token response is not an array:', tokensResponse)
        setTokens([])
      }
    } catch (error) {
      console.error('获取密钥列表失败:', error)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      setError(`获取密钥列表失败: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 当对话框打开时获取密钥列表
  useEffect(() => {
    if (isOpen && account) {
      fetchTokens()
    } else {
      // 关闭时重置状态
      setTokens([])
      setError(null)
      setCopiedKey(null)
      setExpandedTokens(new Set())
    }
  }, [isOpen, account])

  // 复制密钥到剪贴板
  const copyKey = async (key: string) => {
    try {
      // 检查key是否以"sk-"开头，如果不是则添加前缀
      const textToCopy = key.startsWith('sk-') ? key : 'sk-' + key;
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKey(key);
      toast.success('密钥已复制到剪贴板');
      
      // 2秒后清除复制状态
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch (error) {
      console.error('复制失败:', error);
      toast.error('复制失败，请手动复制');
    }
};


  // 切换密钥展开/折叠状态
  const toggleTokenExpansion = (tokenId: number) => {
    setExpandedTokens(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId)
      } else {
        newSet.add(tokenId)
      }
      return newSet
    })
  }

  // 格式化额度显示
  const formatQuota = (token: ApiToken) => {
    if (token.unlimited_quota || token.remain_quota < 0) {
      return '无限额度'
    }
    
    // 使用CONVERSION_FACTOR转换真实额度
    const realQuota = token.remain_quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    return `$${realQuota.toFixed(2)}`
  }

  // 格式化已用额度
  const formatUsedQuota = (token: ApiToken) => {
    const realUsedQuota = token.used_quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    return `$${realUsedQuota.toFixed(2)}`
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    if (timestamp <= 0) return '永不过期'
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN')
  }

  // 获取组别徽章样式
  const getGroupBadgeStyle = (group: string) => {
    // 处理可能为空或未定义的 group
    const groupName = group || 'default'
    
    // 根据组别名称生成不同的颜色主题
    const hash = groupName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    
    const colors = [
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-green-100 text-green-800 border-green-200', 
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-orange-100 text-orange-800 border-orange-200',
      'bg-pink-100 text-pink-800 border-pink-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
      'bg-teal-100 text-teal-800 border-teal-200',
      'bg-yellow-100 text-yellow-800 border-yellow-200'
    ]
    
    return colors[Math.abs(hash) % colors.length]
  }

  // 获取状态徽章样式
  const getStatusBadgeStyle = (status: number) => {
    return status === 1 
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-red-100 text-red-800 border-red-200'
  }

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog
        onClose={onClose}
        className="relative z-50"
      >
        {/* 背景遮罩动画 */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        </TransitionChild>
        
        {/* 居中容器 */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          {/* 弹窗面板动画 */}
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95 translate-y-4"
            enterTo="opacity-100 scale-100 translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100 translate-y-0"
            leaveTo="opacity-0 scale-95 translate-y-4"
          >
            <DialogPanel className="w-full max-w-md bg-white rounded-lg shadow-xl transform transition-all max-h-[85vh] overflow-hidden flex flex-col">
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <KeyIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold text-gray-900">
                      密钥列表
                    </DialogTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {account?.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-4" />
                    <p className="text-sm text-gray-500">正在获密钥列表...</p>
                  </div>
                ) : error ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">获取失败</h3>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                        <button
                          onClick={fetchTokens}
                          className="mt-3 px-3 py-1.5 bg-red-100 text-red-800 text-xs rounded-lg hover:bg-red-200 transition-colors"
                        >
                          重试
                        </button>
                      </div>
                    </div>
                  </div>
                ) : !Array.isArray(tokens) || tokens.length === 0 ? (
                  <div className="text-center py-8">
                    <KeyIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">暂无密钥数据</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Array.isArray(tokens) && tokens.map((token) => {
                      const isExpanded = expandedTokens.has(token.id)
                      
                      return (
                        <div
                          key={token.id}
                          className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-sm transition-all duration-200"
                        >
                          {/* 头部：名称、组别徽章和展开/折叠按钮 */}
                          <div 
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => toggleTokenExpansion(token.id)}
                          >
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <h4 className="font-medium text-gray-900 text-sm truncate">
                                {token.name}
                              </h4>
                              <div className="flex items-center space-x-1.5">
                                <UserGroupIcon className="w-3 h-3 text-gray-400" />
                                <span 
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getGroupBadgeStyle(token.group || '')}`}
                                >
                                  {token.group || '默认组'}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2 ml-3">
                              {/* 状态徽章 */}
                              <span 
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${getStatusBadgeStyle(token.status)}`}
                              >
                                {token.status === 1 ? '启用' : '禁用'}
                              </span>
                              
                              {/* 展开/折叠图标 */}
                              {isExpanded ? (
                                <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </div>

                          {/* 可展开的详细信息区域 */}
                          {isExpanded && (
                            <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50/30">
                              {/* 过期时间 */}
                              <div className="flex items-center space-x-1 text-xs text-gray-500 mb-3 pt-3">
                                <ClockIcon className="w-3 h-3" />
                                <span>过期时间: {formatTime(token.expired_time)}</span>
                              </div>

                              {/* 额度信息网格 */}
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-white rounded p-2 border border-gray-100">
                                  <div className="text-xs text-gray-500 mb-0.5">已用额度</div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {formatUsedQuota(token)}
                                  </div>
                                </div>
                                <div className="bg-white rounded p-2 border border-gray-100">
                                  <div className="text-xs text-gray-500 mb-0.5">剩余额度</div>
                                  <div className={`text-sm font-semibold ${
                                    token.unlimited_quota || token.remain_quota < 0 
                                      ? 'text-green-600' 
                                      : token.remain_quota < 1000000 
                                        ? 'text-orange-600' 
                                        : 'text-gray-900'
                                  }`}>
                                    {formatQuota(token)}
                                  </div>
                                </div>
                              </div>

                              {/* 密钥预览 */}
                              <div className="bg-white rounded p-2 border border-gray-100">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">API 密钥</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      copyKey(token.key)
                                    }}
                                    className="flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-medium rounded hover:from-purple-600 hover:to-indigo-700 transition-all duration-200"
                                  >
                                    {copiedKey === token.key ? (
                                      <>
                                        <CheckIcon className="w-3 h-3" />
                                        <span>已复制</span>
                                      </>
                                    ) : (
                                      <>
                                        <DocumentDuplicateIcon className="w-3 h-3" />
                                        <span>复制</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <div className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200 break-all">
                                  <span className="text-gray-900">{token.key.substring(0, 16)}</span>
                                  <span className="text-gray-400">{'•'.repeat(6)}</span>
                                  <span className="text-gray-900">{token.key.substring(token.key.length - 6)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 底部操作区 */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {tokens.length > 0 && (
                      <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                        <KeyIcon className="w-3 h-3" />
                        <span>共 {tokens.length} 个密钥</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
