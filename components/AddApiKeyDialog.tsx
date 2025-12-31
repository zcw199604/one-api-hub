import { Fragment, useState, useEffect } from "react"
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react"
import { XMarkIcon, KeyIcon } from "@heroicons/react/24/outline"
import toast from 'react-hot-toast'
import type { SavedApiKey } from "../types/quotaCheck"

interface AddApiKeyDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { name: string; baseUrl: string; apiKey: string }) => Promise<void>
  editingKey?: SavedApiKey | null
}

export default function AddApiKeyDialog({ isOpen, onClose, onSave, editingKey }: AddApiKeyDialogProps) {
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // 编辑模式时填充数据
  useEffect(() => {
    if (editingKey) {
      setName(editingKey.name)
      setBaseUrl(editingKey.baseUrl)
      setApiKey(editingKey.apiKey)
    } else {
      setName("")
      setBaseUrl("")
      setApiKey("")
    }
  }, [editingKey, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证
    if (!name.trim()) {
      toast.error("请输入名称")
      return
    }
    if (!baseUrl.trim()) {
      toast.error("请输入 Base URL")
      return
    }
    if (!apiKey.trim()) {
      toast.error("请输入 API Key")
      return
    }

    // 验证 URL 格式
    try {
      new URL(baseUrl.trim())
    } catch {
      toast.error("Base URL 格式不正确")
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim()
      })
      onClose()
    } catch (error) {
      console.error("保存失败:", error)
      toast.error("保存失败")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* 背景遮罩 */}
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
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95 translate-y-4"
            enterTo="opacity-100 scale-100 translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100 translate-y-0"
            leaveTo="opacity-0 scale-95 translate-y-4"
          >
            <DialogPanel className="w-full max-w-md bg-white rounded-lg shadow-xl transform transition-all">
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <KeyIcon className="w-4 h-4 text-white" />
                  </div>
                  <DialogTitle className="text-lg font-semibold text-gray-900">
                    {editingKey ? "编辑 API Key" : "添加 API Key"}
                  </DialogTitle>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                {/* 名称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：公益站点A"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">自定义名称，便于识别</p>
                </div>

                {/* Base URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="例如：https://api.example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">API 站点地址，不需要包含 /v1</p>
                </div>

                {/* API Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">sk-xxx 格式的 API 密钥</p>
                </div>

                {/* 按钮 */}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? "保存中..." : "保存"}
                  </button>
                </div>
              </form>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
