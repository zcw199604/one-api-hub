import { useState, useEffect, Fragment } from 'react'
import { Dialog, Transition, Switch } from '@headlessui/react'
import { 
  XMarkIcon, 
  KeyIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { 
  fetchAvailableModels, 
  fetchUserGroups, 
  createApiToken,
  fetchTokenById,
  updateApiToken,
  type GroupInfo,
  type CreateTokenRequest,
  type ApiToken
} from '../services/apiService'
import { UI_CONSTANTS } from '../constants/ui'
import toast from 'react-hot-toast'

interface AddTokenDialogProps {
  isOpen: boolean
  onClose: () => void
  availableAccounts: Array<{
    id: string
    name: string
    baseUrl: string
    userId: number
    token: string
  }>
  preSelectedAccountId?: string | null
  editingToken?: ApiToken & { accountName: string } | null
}

interface FormData {
  accountId: string
  name: string
  quota: string
  expiredTime: string
  unlimitedQuota: boolean
  modelLimitsEnabled: boolean
  modelLimits: string[]
  allowIps: string
  group: string
}

export default function AddTokenDialog({ isOpen, onClose, availableAccounts, preSelectedAccountId, editingToken }: AddTokenDialogProps) {
  const [formData, setFormData] = useState<FormData>({
    accountId: '',
    name: '',
    quota: '',
    expiredTime: '',
    unlimitedQuota: true,
    modelLimitsEnabled: false,
    modelLimits: [],
    allowIps: '',
    group: 'default'
  })

  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [groups, setGroups] = useState<Record<string, GroupInfo>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 获取当前选中的账号
  const currentAccount = availableAccounts.find(acc => acc.id === formData.accountId)
  
  // 判断是否为编辑模式
  const isEditMode = !!editingToken

  // 初始化表单数据
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && editingToken) {
        // 编辑模式：从 editingToken 填充表单数据
        const matchingAccount = availableAccounts.find(acc => acc.id === preSelectedAccountId)
          || availableAccounts.find(acc => acc.name === editingToken.accountName)
        const accountId = matchingAccount?.id || (availableAccounts.length > 0 ? availableAccounts[0].id : '')
        
        setFormData({
          accountId,
          name: editingToken.name,
          quota: editingToken.unlimited_quota ? '' : (editingToken.remain_quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR).toString(),
          expiredTime: editingToken.expired_time === -1 ? '' : new Date(editingToken.expired_time * 1000).toISOString().slice(0, 16),
          unlimitedQuota: editingToken.unlimited_quota,
          modelLimitsEnabled: editingToken.model_limits_enabled || false,
          modelLimits: editingToken.model_limits ? editingToken.model_limits.split(',') : [],
          allowIps: editingToken.allow_ips || '',
          group: editingToken.group || 'default'
        })
      } else {
        // 创建模式：使用默认值
        const defaultAccountId = preSelectedAccountId || (availableAccounts.length > 0 ? availableAccounts[0].id : '')
        setFormData({
          accountId: defaultAccountId,
          name: '',
          quota: '',
          expiredTime: '',
          unlimitedQuota: true,
          modelLimitsEnabled: false,
          modelLimits: [],
          allowIps: '',
          group: 'default'
        })
      }
    }
  }, [isOpen, preSelectedAccountId, availableAccounts, isEditMode, editingToken])

  // 加载数据
  useEffect(() => {
    if (isOpen && currentAccount) {
      loadInitialData()
    }
  }, [isOpen, currentAccount])

  const loadInitialData = async () => {
    if (!currentAccount) return
    
    setIsLoading(true)
    try {
      const [models, groupsData] = await Promise.all([
        fetchAvailableModels(currentAccount.baseUrl, currentAccount.userId, currentAccount.token),
        fetchUserGroups(currentAccount.baseUrl, currentAccount.userId, currentAccount.token)
      ])
      
      setAvailableModels(models)
      setGroups(groupsData)
      
      // 设置默认分组
      if (groupsData.default) {
        setFormData(prev => ({ ...prev, group: 'default' }))
      } else {
        const firstGroup = Object.keys(groupsData)[0]
        if (firstGroup) {
          setFormData(prev => ({ ...prev, group: firstGroup }))
        }
      }
    } catch (error) {
      console.error('加载初始数据失败:', error)
      toast.error('加载数据失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  // 验证表单
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.accountId) {
      newErrors.accountId = '请选择账号'
    }

    if (!formData.name.trim()) {
      newErrors.name = '密钥名称不能为空'
    }

    if (!formData.unlimitedQuota) {
      const quota = parseFloat(formData.quota)
      if (isNaN(quota) || quota <= 0) {
        newErrors.quota = '请输入有效的额度金额'
      }
    }

    if (formData.expiredTime) {
      const expiredDate = new Date(formData.expiredTime)
      if (expiredDate <= new Date()) {
        newErrors.expiredTime = '过期时间必须大于当前时间'
      }
    }

    if (formData.allowIps && !isValidIpList(formData.allowIps)) {
      newErrors.allowIps = '请输入有效的IP地址，多个IP用逗号分隔'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 验证IP地址列表
  const isValidIpList = (ips: string): boolean => {
    const ipList = ips.split(',').map(ip => ip.trim())
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    
    return ipList.every(ip => {
      if (!ip) return false
      if (ip === '*') return true // 允许通配符
      return ipRegex.test(ip) && ip.split('.').every(part => {
        const num = parseInt(part)
        return num >= 0 && num <= 255
      })
    })
  }

  // 处理表单提交
  const handleSubmit = async () => {
    if (!currentAccount || !validateForm()) return

    setIsSubmitting(true)
    try {
      // 准备请求数据
      const tokenData: CreateTokenRequest = {
        name: formData.name.trim(),
        remain_quota: formData.unlimitedQuota ? -1 : Math.floor(parseFloat(formData.quota) * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
        expired_time: formData.expiredTime ? Math.floor(new Date(formData.expiredTime).getTime() / 1000) : -1,
        unlimited_quota: formData.unlimitedQuota,
        model_limits_enabled: formData.modelLimitsEnabled,
        model_limits: formData.modelLimits.join(','),
        allow_ips: formData.allowIps.trim() || '',
        group: formData.group
      }

      if (isEditMode && editingToken) {
        // 编辑模式
        await updateApiToken(currentAccount.baseUrl, currentAccount.userId, currentAccount.token, editingToken.id, tokenData)
        toast.success('密钥更新成功')
      } else {
        // 创建模式
        await createApiToken(currentAccount.baseUrl, currentAccount.userId, currentAccount.token, tokenData)
        toast.success('密钥创建成功')
      }
      
      handleClose()
    } catch (error) {
      console.error(`${isEditMode ? '更新' : '创建'}密钥失败:`, error)
      toast.error(`${isEditMode ? '更新' : '创建'}密钥失败，请稍后重试`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 关闭对话框
  const handleClose = () => {
    setFormData({
      accountId: '',
      name: '',
      quota: '',
      expiredTime: '',
      unlimitedQuota: true,
      modelLimitsEnabled: false,
      modelLimits: [],
      allowIps: '',
      group: 'default'
    })
    setErrors({})
    setAvailableModels([])
    setGroups({})
    onClose()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all">
                {/* 标题栏 */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <KeyIcon className="w-6 h-6 text-blue-600" />
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {isEditMode ? '编辑API密钥' : '添加API密钥'}
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {isLoading ? (
                  <div className="space-y-4">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                      <div className="space-y-3">
                        <div className="h-10 bg-gray-200 rounded"></div>
                        <div className="h-10 bg-gray-200 rounded"></div>
                        <div className="h-10 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 基本信息 */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-gray-900">基本信息</h3>
                      
                      {/* 账号选择 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          选择账号 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.accountId}
                          onChange={(e) => setFormData(prev => ({ ...prev, accountId: e.target.value }))}
                          disabled={isEditMode} // 编辑模式下禁用账号选择
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.accountId ? 'border-red-300' : 'border-gray-300'
                          } ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        >
                          <option value="">请选择账号</option>
                          {availableAccounts.map(account => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        {errors.accountId && (
                          <p className="mt-1 text-xs text-red-600">{errors.accountId}</p>
                        )}
                        {isEditMode && (
                          <p className="mt-1 text-xs text-gray-500">编辑模式下无法更改账号</p>
                        )}
                      </div>
                      
                      {/* 密钥名称 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          密钥名称 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.name ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="请输入密钥名称"
                        />
                        {errors.name && (
                          <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                        )}
                      </div>

                      {/* 额度设置 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700">额度设置</label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">无限额度</span>
                            <Switch
                              checked={formData.unlimitedQuota}
                              onChange={(checked) => setFormData(prev => ({ ...prev, unlimitedQuota: checked }))}
                              className={`${
                                formData.unlimitedQuota ? 'bg-blue-600' : 'bg-gray-200'
                              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                            >
                              <span
                                className={`${
                                  formData.unlimitedQuota ? 'translate-x-6' : 'translate-x-1'
                                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                              />
                            </Switch>
                          </div>
                        </div>
                        
                        {!formData.unlimitedQuota && (
                          <div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={formData.quota}
                              onChange={(e) => setFormData(prev => ({ ...prev, quota: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                errors.quota ? 'border-red-300' : 'border-gray-300'
                              }`}
                              placeholder="请输入额度金额（美元）"
                            />
                            {errors.quota && (
                              <p className="mt-1 text-xs text-red-600">{errors.quota}</p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                              1美元 = {UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR.toLocaleString()} 配额点数
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 过期时间 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          过期时间
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.expiredTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, expiredTime: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.expiredTime ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.expiredTime && (
                          <p className="mt-1 text-xs text-red-600">{errors.expiredTime}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">留空表示永不过期</p>
                      </div>
                    </div>

                    {/* 高级设置 */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-gray-900">高级设置</h3>
                      
                      {/* 分组选择 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          分组
                        </label>
                        <select
                          value={formData.group}
                          onChange={(e) => setFormData(prev => ({ ...prev, group: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {Object.entries(groups).map(([key, group]) => (
                            <option key={key} value={key}>
                              {group.desc} (倍率: {group.ratio})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 模型限制 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700">模型限制</label>
                          <Switch
                            checked={formData.modelLimitsEnabled}
                            onChange={(enabled) => setFormData(prev => ({ 
                              ...prev, 
                              modelLimitsEnabled: enabled,
                              modelLimits: enabled ? prev.modelLimits : []
                            }))}
                            className={`${
                              formData.modelLimitsEnabled ? 'bg-blue-600' : 'bg-gray-200'
                            } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                          >
                            <span
                              className={`${
                                formData.modelLimitsEnabled ? 'translate-x-6' : 'translate-x-1'
                              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                            />
                          </Switch>
                        </div>

                        {formData.modelLimitsEnabled && (
                          <div>
                            <select
                              multiple
                              value={formData.modelLimits}
                              onChange={(e) => {
                                const values = Array.from(e.target.selectedOptions, option => option.value)
                                setFormData(prev => ({ ...prev, modelLimits: values }))
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                            >
                              {availableModels.map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                              按住 Ctrl/Cmd 键可多选模型，已选择 {formData.modelLimits.length} 个模型
                            </p>
                          </div>
                        )}
                      </div>

                      {/* IP 限制 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          IP限制
                        </label>
                        <input
                          type="text"
                          value={formData.allowIps}
                          onChange={(e) => setFormData(prev => ({ ...prev, allowIps: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.allowIps ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="留空表示不限制，多个IP用逗号分隔"
                        />
                        {errors.allowIps && (
                          <p className="mt-1 text-xs text-red-600">{errors.allowIps}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          例如: 192.168.1.1,10.0.0.1 或使用 * 表示不限制
                        </p>
                      </div>
                    </div>

                    {/* 警告提示 */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-800">
                          <p className="font-medium mb-1">注意事项</p>
                          <ul className="text-xs space-y-1">
                            <li>• 请妥善保管API密钥，避免泄露</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !currentAccount}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {isSubmitting && (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                        <span>{isSubmitting ? (isEditMode ? '更新中...' : '创建中...') : (isEditMode ? '更新密钥' : '创建密钥')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
