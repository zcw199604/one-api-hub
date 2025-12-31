import { useState, useEffect } from "react"
import {
  MagnifyingGlassCircleIcon,
  PlusIcon,
  ArrowPathIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from "@heroicons/react/24/outline"
import toast from 'react-hot-toast'
import type { SavedApiKey, ApiKeyQuotaInfo } from "../../types/quotaCheck"
import { checkApiKeyQuota } from "../../services/apiService"
import {
  getSavedApiKeys,
  addApiKey,
  updateApiKey,
  deleteApiKey as deleteApiKeyFromStorage,
  updateQuotaInfo
} from "../../services/quotaCheckStorage"
import AddApiKeyDialog from "../../components/AddApiKeyDialog"

export default function QuotaCheck() {
  const [savedKeys, setSavedKeys] = useState<SavedApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<SavedApiKey | null>(null)

  // 加载保存的 Key 列表
  const loadKeys = async () => {
    setIsLoading(true)
    try {
      const keys = await getSavedApiKeys()
      setSavedKeys(keys)
    } catch (error) {
      console.error("加载 Key 列表失败:", error)
      toast.error("加载 Key 列表失败")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [])

  // 检测单个 Key 的额度
  const handleCheckQuota = async (key: SavedApiKey) => {
    setCheckingIds((prev) => new Set(prev).add(key.id))

    try {
      const quotaInfo = await checkApiKeyQuota(key.baseUrl, key.apiKey)
      await updateQuotaInfo(key.id, quotaInfo)

      // 更新本地状态
      setSavedKeys((prev) =>
        prev.map((k) =>
          k.id === key.id
            ? { ...k, lastCheckedAt: Date.now(), lastQuotaInfo: quotaInfo }
            : k
        )
      )

      if (quotaInfo.isValid) {
        toast.success(`${key.name} 检测成功`)
      } else {
        toast.error(`${key.name}: ${quotaInfo.errorMessage}`)
      }
    } catch (error) {
      console.error("检测失败:", error)
      toast.error(`${key.name} 检测失败`)
    } finally {
      setCheckingIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(key.id)
        return newSet
      })
    }
  }

  // 检测所有 Key
  const handleCheckAll = async () => {
    if (savedKeys.length === 0) {
      toast.error("没有可检测的 Key")
      return
    }

    toast.loading("正在检测所有 Key...", { id: "check-all" })

    for (const key of savedKeys) {
      await handleCheckQuota(key)
    }

    toast.dismiss("check-all")
    toast.success("全部检测完成")
  }

  // 保存 Key（新增或编辑）
  const handleSaveKey = async (data: { name: string; baseUrl: string; apiKey: string }) => {
    if (editingKey) {
      // 编辑模式
      await updateApiKey(editingKey.id, data)
      toast.success("更新成功")
    } else {
      // 新增模式
      await addApiKey(data)
      toast.success("添加成功")
    }
    await loadKeys()
    setEditingKey(null)
  }

  // 删除 Key
  const handleDeleteKey = async (key: SavedApiKey) => {
    if (!window.confirm(`确定要删除 "${key.name}" 吗？`)) {
      return
    }

    try {
      await deleteApiKeyFromStorage(key.id)
      toast.success("删除成功")
      await loadKeys()
    } catch (error) {
      console.error("删除失败:", error)
      toast.error("删除失败")
    }
  }

  // 编辑 Key
  const handleEditKey = (key: SavedApiKey) => {
    setEditingKey(key)
    setIsDialogOpen(true)
  }

  // 切换 Key 可见性
  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // 格式化 Key 显示
  const formatApiKey = (apiKey: string, id: string) => {
    if (visibleKeys.has(id)) {
      return apiKey
    }
    if (apiKey.length <= 12) {
      return "****"
    }
    return `${apiKey.substring(0, 6)}****${apiKey.substring(apiKey.length - 4)}`
  }

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "从未检测"
    return new Date(timestamp).toLocaleString("zh-CN")
  }

  // 获取余额颜色
  const getBalanceColor = (quotaInfo?: ApiKeyQuotaInfo) => {
    if (!quotaInfo || !quotaInfo.isValid) return "text-gray-500"
    if (quotaInfo.balance <= 0) return "text-red-600"
    if (quotaInfo.balance < 1) return "text-orange-600"
    return "text-green-600"
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <MagnifyingGlassCircleIcon className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">额度检测</h1>
          </div>
          <div className="flex items-center space-x-3">
            {savedKeys.length > 0 && (
              <button
                onClick={handleCheckAll}
                disabled={checkingIds.size > 0}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <ArrowPathIcon className={`w-4 h-4 ${checkingIds.size > 0 ? "animate-spin" : ""}`} />
                <span>检测全部</span>
              </button>
            )}
            <button
              onClick={() => {
                setEditingKey(null)
                setIsDialogOpen(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center space-x-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span>添加 Key</span>
            </button>
          </div>
        </div>
        <p className="text-gray-500">管理和检测公益 API Key 的剩余额度</p>
      </div>

      {/* Key 列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : savedKeys.length === 0 ? (
        <div className="text-center py-12">
          <MagnifyingGlassCircleIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">暂无保存的 API Key</p>
          <button
            onClick={() => {
              setEditingKey(null)
              setIsDialogOpen(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center space-x-2 mx-auto"
          >
            <PlusIcon className="w-4 h-4" />
            <span>添加第一个 Key</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {savedKeys.map((key) => {
            const isChecking = checkingIds.has(key.id)
            const quotaInfo = key.lastQuotaInfo

            return (
              <div
                key={key.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* 名称和状态 */}
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {key.name}
                      </h3>
                      {quotaInfo && (
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            quotaInfo.isValid
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {quotaInfo.isValid ? (
                            <>
                              <CheckCircleIcon className="w-3 h-3 mr-1" />
                              有效
                            </>
                          ) : (
                            <>
                              <ExclamationCircleIcon className="w-3 h-3 mr-1" />
                              无效
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {/* 基本信息 */}
                    <div className="space-y-1 text-sm text-gray-600 mb-3">
                      <div>
                        <span className="text-gray-500">Base URL:</span>
                        <span className="ml-2 font-mono">{key.baseUrl}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-500">API Key:</span>
                        <code className="ml-2 bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">
                          {formatApiKey(key.apiKey, key.id)}
                        </code>
                        <button
                          onClick={() => toggleKeyVisibility(key.id)}
                          className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {visibleKeys.has(key.id) ? (
                            <EyeSlashIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 额度信息 */}
                    {quotaInfo && quotaInfo.isValid && (
                      <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded-lg mb-3">
                        <div>
                          <div className="text-xs text-gray-500">剩余余额</div>
                          <div className={`text-lg font-semibold ${getBalanceColor(quotaInfo)}`}>
                            ${quotaInfo.balance.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">已用额度</div>
                          <div className="text-lg font-semibold text-gray-900">
                            ${quotaInfo.usedAmount.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">总额度</div>
                          <div className="text-lg font-semibold text-gray-900">
                            ${quotaInfo.totalAmount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 错误信息 */}
                    {quotaInfo && !quotaInfo.isValid && quotaInfo.errorMessage && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-3">
                        <p className="text-sm text-red-700">{quotaInfo.errorMessage}</p>
                      </div>
                    )}

                    {/* 上次检测时间 */}
                    <div className="text-xs text-gray-400">
                      上次检测: {formatTime(key.lastCheckedAt)}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleCheckQuota(key)}
                      disabled={isChecking}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
                      <span>{isChecking ? "检测中" : "检测"}</span>
                    </button>
                    <button
                      onClick={() => handleEditKey(key)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteKey(key)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 说明文字 */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <MagnifyingGlassCircleIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-blue-800 font-medium mb-1">使用说明</p>
            <p className="text-blue-700">
              此功能用于检测公益 API Key 的剩余额度。添加 Key 后点击「检测」按钮即可查询余额。
              支持 one-api / new-api 等站点的 billing 接口。
            </p>
          </div>
        </div>
      </div>

      {/* 添加/编辑弹窗 */}
      <AddApiKeyDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false)
          setEditingKey(null)
        }}
        onSave={handleSaveKey}
        editingKey={editingKey}
      />
    </div>
  )
}
