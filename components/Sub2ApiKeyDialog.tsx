import { useEffect, useState } from "react"
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react"
import toast from "react-hot-toast"
import type { Sub2ApiKey } from "../adapters/sub2apiKeys"
import { withSub2ApiKeys } from "../services/tokenManagement"
import { emptySub2ApiKeyForm as initialForm, sub2ApiKeyForm, buildSub2ApiKeyInput } from "../utils/sub2apiKeyForm"

interface Props {
  accountId: string
  keyId?: number
  onClose: () => void
}

export default function Sub2ApiKeyDialog({ accountId, keyId, onClose }: Props) {
  const [form, setForm] = useState(initialForm)
  const [original, setOriginal] = useState<Sub2ApiKey | null>(null)
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoaded(false)
    setError("")
    withSub2ApiKeys(accountId, async (adapter, credentials) => Promise.all([
      adapter.getKeyGroups(credentials),
      keyId ? adapter.getKey(credentials, String(keyId)) : Promise.resolve(null)
    ])).then(([available, key]) => {
      if (cancelled) return
      const nextForm = key ? sub2ApiKeyForm(key) : initialForm
      setGroups(available)
      setOriginal(key)
      setForm(nextForm)
      setLoaded(true)
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "加载密钥配置失败") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountId, keyId])

  const field = (name: keyof typeof initialForm) => ({ value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(previous => ({ ...previous, [name]: event.target.value }))
    } })
  const inputClass = "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || loading || !loaded || (keyId && !original)) return
    setSaving(true)
    setError("")
    try {
      const config = buildSub2ApiKeyInput(form, original)
      await withSub2ApiKeys(accountId, (adapter, credentials) => keyId
        ? adapter.updateApiToken(credentials, String(keyId), config)
        : adapter.createApiToken(credentials, config))
      toast.success(keyId ? "密钥更新成功" : "密钥创建成功")
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存密钥失败")
    } finally { setSaving(false) }
  }
  return (
    <Dialog open onClose={() => { if (!saving) onClose() }} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4 flex items-center justify-center">
        <DialogPanel className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold mb-4">{keyId ? "编辑" : "创建"} Sub2API 密钥</DialogTitle>
          {error && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? <p>正在加载密钥配置…</p> : (
            <form onSubmit={submit} className="space-y-4">
              <fieldset disabled={saving || !loaded} className="space-y-4 disabled:opacity-60">
                <label className="block text-sm">密钥名称<input required maxLength={100} {...field("name")} className={inputClass} /></label>
                <label className="block text-sm">分组
                  <select {...field("group")} className={inputClass}>
                    <option value="" disabled={!!original?.group_id}>不指定分组</option>
                    {original?.group_id && !groups.some(group => group.id === original.group_id) &&
                      <option value={original.group_id}>{original.group?.name || `当前分组 ${original.group_id}`}</option>}
                    {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm">总额度上限（美元，0 为无限）
                  <input required type="number" min="0" step="any" {...field("quota")} className={inputClass} />
                  {original && <span className="text-gray-500">已消耗 ${original.quota_used.toFixed(2)}；修改上限不会重置已用额度。</span>}
                </label>
                {keyId ? <>
                  <label className="block text-sm">到期时间（留空为永不过期）<input type="datetime-local" {...field("expiry")} className={inputClass} /></label>
                  <label className="block text-sm">状态<select {...field("status")} className={inputClass}>
                    <option value="active">启用</option><option value="inactive">禁用</option>
                    {original?.status === "quota_exhausted" && <option value="quota_exhausted" disabled>额度耗尽</option>}
                    {original?.status === "expired" && <option value="expired" disabled>已过期</option>}
                  </select></label>
                </> : <label className="block text-sm">有效天数（留空为永不过期）<input type="number" min="1" step="1" {...field("days")} className={inputClass} /></label>}
                <label className="block text-sm">IP 白名单（每行一项，支持 CIDR；留空不限制）<textarea {...field("whitelist")} className={inputClass} rows={2} /></label>
                <label className="block text-sm">IP 黑名单（每行一项，支持 CIDR）<textarea {...field("blacklist")} className={inputClass} rows={2} /></label>
                <div className="grid grid-cols-3 gap-3">
                  {([['limit5h', '5 小时'], ['limit1d', '1 天'], ['limit7d', '7 天']] as const).map(([name, label]) =>
                    <label className="text-sm" key={name}>{label}限额（美元）<input required type="number" min="0" step="any" {...field(name)} className={inputClass} /></label>)}
                </div>
                <p className="text-xs text-gray-500">时间窗口限额为 0 时不限制。模型可用范围由所选分组决定。</p>
              </fieldset>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" disabled={saving} onClick={onClose} className="rounded border px-4 py-2 text-sm">取消</button>
                <button type="submit" disabled={saving || !loaded} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
