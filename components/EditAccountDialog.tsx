import { useState, useEffect, Fragment } from "react"
import toast from 'react-hot-toast'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react"
import { GlobeAltIcon, XMarkIcon, PencilIcon, UserIcon, KeyIcon, EyeIcon, EyeSlashIcon, CurrencyDollarIcon, SparklesIcon, CheckIcon, UsersIcon } from "@heroicons/react/24/outline"
import { accountStorage } from "../services/accountStorage"
import { autoDetectAccount, validateAndUpdateAccount, extractDomainPrefix, isValidExchangeRate } from "../services/accountOperations"
import AutoDetectErrorAlert from "./AutoDetectErrorAlert"
import type { AutoDetectError } from "../utils/autoDetectUtils"
import type { DisplaySiteData } from "../types"
import { SiteAdapterRegistry } from "../adapters/SiteAdapterRegistry"
import { AdapterCapability } from "../adapters/types"

interface EditAccountDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData | null
}

export default function EditAccountDialog({ isOpen, onClose, account }: EditAccountDialogProps) {
  const registry = SiteAdapterRegistry.getInstance()
  const supportedSiteTypes = registry.getSupportedSiteTypes()

  const [url, setUrl] = useState("")
  const [siteType, setSiteType] = useState<string>("one-api")
  const [isDetecting, setIsDetecting] = useState(false)
  const [siteName, setSiteName] = useState("")
  const [username, setUsername] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [userId, setUserId] = useState("")
  const [isDetected, setIsDetected] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [detectionError, setDetectionError] = useState<AutoDetectError | null>(null)
  const [showManualForm, setShowManualForm] = useState(true) // 编辑模式默认显示表单
  const [exchangeRate, setExchangeRate] = useState("")

  const effectiveSiteType = (() => {
    if (siteType !== "auto") return siteType
    try {
      const host = new URL(url).hostname.toLowerCase()
      if (host === "cubence.com" || host.endsWith(".cubence.com")) return "cubence"
    } catch {
      // ignore
    }
    return "one-api"
  })()

  const adapter = registry.getAdapter(effectiveSiteType)
  const isOneApiFamily = adapter?.metadata.id === "one-api"
  const supportsAutoDetect =
    adapter?.metadata.capabilities.includes(AdapterCapability.AUTO_DETECT) ?? false
  
  // 重置表单数据
  const resetForm = () => {
    setUrl("")
    setSiteType("one-api")
    setIsDetected(false)
    setSiteName("")
    setUsername("")
    setAccessToken("")
    setUserId("")
    setShowAccessToken(false)
    setDetectionError(null)
    setShowManualForm(true)
    setExchangeRate("")
  }

  // 加载账号数据到表单
  const loadAccountData = async (accountId: string) => {
    try {
      const siteAccount = await accountStorage.getAccountById(accountId)
      if (siteAccount) {
        setUrl(siteAccount.site_url)
        setSiteType((siteAccount.site_type ?? "one-api").toLowerCase())
        setSiteName(siteAccount.site_name)
        setUsername(siteAccount.account_info.username || "")
        setAccessToken(siteAccount.account_info.access_token || "")
        setUserId((siteAccount.account_info.id ?? "").toString())
        setExchangeRate(siteAccount.exchange_rate.toString())
      }
    } catch (error) {
      console.error('加载账号数据失败:', error)
    }
  }

  useEffect(() => {
    if (isOpen && account) {
      resetForm()
      loadAccountData(account.id)
    } else if (!isOpen) {
      resetForm()
    }
  }, [isOpen, account])

  const handleAutoDetect = async () => {
    if (!url.trim()) {
      return
    }

    setIsDetecting(true)
    setDetectionError(null)
    
    try {
      const result = await autoDetectAccount(url.trim(), siteType)
      
      if (!result.success) {
        setDetectionError(result.detailedError || null)
        return
      }

      if (result.data) {
        if (siteType === "auto" && result.data.siteType) {
          setSiteType(result.data.siteType)
        }

        // 更新表单数据
        setUsername(result.data.username)
        setAccessToken(result.data.accessToken)
        setUserId(result.data.userId)
        
        // 设置充值比例默认值
        if (result.data.exchangeRate) {
          setExchangeRate(result.data.exchangeRate.toString())
          console.log('获取到默认充值比例:', result.data.exchangeRate)
        } else {
          console.log('未获取到默认充值比例，保持当前值')
        }
        
        setIsDetected(true)
        
        console.log('自动识别成功:', { 
          username: result.data.username, 
          siteName, 
          exchangeRate: result.data.exchangeRate 
        })
      }
    } catch (error) {
      console.error('自动识别失败:', error)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      // 使用通用错误处理
      setDetectionError({
        type: 'unknown' as any,
        message: `自动识别失败: ${errorMessage}`,
        helpDocUrl: '#'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSaveAccount = async () => {
    if (!account) {
      toast.error('账号信息错误')
      return
    }

    setIsSaving(true)
    
    try {
      await toast.promise(
        validateAndUpdateAccount(
          account.id,
          url.trim(),
          siteName.trim(),
          username.trim(),
          accessToken.trim(),
          userId.trim(),
          exchangeRate,
          siteType
        ),
        {
          loading: '正在保存更改...',
          success: (result) => {
            if (result.success) {
              onClose()
              return `账号 ${siteName} 更新成功!`
            } else {
              throw new Error(result.error || '更新失败')
            }
          },
          error: (err) => {
            const errorMsg = err.message || '更新失败'
            return `更新失败: ${errorMsg}`
          },
        }
      )
    } catch (error) {
      console.error('更新账号失败:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isDetected || showManualForm) {
      handleSaveAccount()
    } else {
      handleAutoDetect()
    }
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
        
        {/* 居中容器 - 针对插件优化 */}
        <div className="fixed inset-0 flex items-center justify-center p-2">
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
            <DialogPanel className="w-full max-w-sm bg-white rounded-lg shadow-xl transform transition-all max-h-[90vh] overflow-y-auto">
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                    <PencilIcon className="w-4 h-4 text-white" />
                  </div>
                  <DialogTitle className="text-lg font-semibold text-gray-900">
                    编辑账号
                  </DialogTitle>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="p-4">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* 识别错误提示 */}
                  {detectionError && (
                    <AutoDetectErrorAlert 
                      error={detectionError}
                      siteUrl={url}
                    />
                  )}

                  {/* 站点类型 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      站点类型
                    </label>
                    <select
                      value={siteType}
                      onChange={(e) => {
                        const next = e.target.value
                        setSiteType(next)
                        setIsDetected(false)
                        setDetectionError(null)
                        if (next === "cubence") {
                          setAccessToken("")
                          setUserId("")
                        }
                      }}
                      className="block w-full py-3 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white"
                    >
                      <option value="auto">自动识别</option>
                      {supportedSiteTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* URL 输入框 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      站点地址
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <GlobeAltIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => {
                          const inputUrl = e.target.value
                          
                          // 当用户输入 URL 时，提取协议和主机部分
                          if (inputUrl.trim()) {
                            try {
                              const urlObj = new URL(inputUrl)
                              // 只保留协议和主机部分，不带路径
                              const baseUrl = `${urlObj.protocol}//${urlObj.host}`
                              setUrl(baseUrl)
                              
                              // 自动更新站点名称
                              const domainPrefix = extractDomainPrefix(urlObj.hostname)
                              setSiteName(domainPrefix)
                            } catch (error) {
                              // 如果 URL 格式不完整，先保存用户输入，但尝试提取域名
                              setUrl(inputUrl)
                              const match = inputUrl.match(/\/\/([^\/]+)/)
                              if (match) {
                                const domainPrefix = extractDomainPrefix(match[1])
                                setSiteName(domainPrefix)
                              }
                            }
                          } else {
                            setUrl("")
                            setSiteName("")
                          }
                        }}
                        placeholder="https://example.com"
                        className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                        required
                        disabled={isDetected}
                      />
                      {url && (
                        <button
                          type="button"
                          onClick={() => setUrl('')}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                          disabled={isDetected}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      请输入 One API 或 New API 站点的完整地址
                    </p>
                  </div>

                  {/* 账号信息表单 */}
                  <div className="space-y-6">
                    {/* 网站名称 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        网站名称
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <GlobeAltIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          value={siteName}
                          onChange={(e) => setSiteName(e.target.value)}
                          placeholder="example.com"
                          className="block w-full pl-10 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                          required
                        />
                      </div>
                    </div>

                    {/* 用户名 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        用户名
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <UserIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="用户名"
                          className="block w-full pl-10 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                          required={isOneApiFamily}
                        />
                      </div>
                    </div>

                    {isOneApiFamily && (
                      <>
                        {/* 用户 ID */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            用户 ID
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-gray-400 font-mono text-sm">#</span>
                            </div>
                            <input
                              type="number"
                              value={userId}
                              onChange={(e) => setUserId(e.target.value)}
                              placeholder="用户 ID (数字)"
                              className="block w-full pl-10 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                              required
                            />
                          </div>
                        </div>

                        {/* 访问令牌 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            访问令牌
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <KeyIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                              type={showAccessToken ? "text" : "password"}
                              value={accessToken}
                              onChange={(e) => setAccessToken(e.target.value)}
                              placeholder="访问令牌"
                              className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowAccessToken(!showAccessToken)}
                              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              {showAccessToken ? (
                                <EyeSlashIcon className="h-4 w-4" />
                              ) : (
                                <EyeIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* 充值金额比例 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        充值金额比例 (CNY/USD)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CurrencyDollarIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={exchangeRate}
                          onChange={(e) => setExchangeRate(e.target.value)}
                          placeholder="请输入充值比例"
                          className={`block w-full pl-10 py-3 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors ${
                            isValidExchangeRate(exchangeRate) 
                              ? 'border-gray-200 focus:ring-green-500 focus:border-transparent' 
                              : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                          }`}
                          required
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <span className="text-sm text-gray-500">CNY</span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        表示充值 1 美元需要多少人民币
                      </p>
                      {!isValidExchangeRate(exchangeRate) && exchangeRate && (
                        <p className="mt-1 text-xs text-red-600">
                          请输入有效的汇率 (0.1 - 100)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 按钮组 */}
                  <div className="flex space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      取消
                    </button>
                    
                    {/* 重新识别按钮 */}
                    {!isDetected && (
                      <button
                        type="button"
                        onClick={handleAutoDetect}
                        disabled={!url.trim() || isDetecting || !supportsAutoDetect}
                        className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      >
                        {isDetecting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>识别中...</span>
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="w-4 h-4" />
                            <span>重新识别</span>
                          </>
                        )}
                      </button>
                    )}
                    
                    {/* 保存按钮 */}
                    <button
                      type="submit"
                      disabled={
                        isOneApiFamily
                          ? !siteName.trim() ||
                            !username.trim() ||
                            !accessToken.trim() ||
                            !userId.trim() ||
                            !isValidExchangeRate(exchangeRate) ||
                            isSaving
                          : !siteName.trim() || !isValidExchangeRate(exchangeRate) || isSaving
                      }
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>保存中...</span>
                        </>
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          <span>保存更改</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* 提示信息 */}
              <div className="px-4 pb-4">
                <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <UsersIcon className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-xs font-medium text-green-800">
                        编辑账号信息
                      </h3>
                      <div className="mt-1 text-xs text-green-700">
                        <p>
                          修改账号信息后，系统会重新验证并获取最新的余额数据。
                        </p>
                        <p>
                          如果站点信息有变化，建议点击"重新识别"按钮（需要在目标站点先自行登录）
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
