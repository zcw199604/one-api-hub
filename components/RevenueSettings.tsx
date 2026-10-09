import { useEffect, useState } from "react"
import { SiteAdapterRegistry } from "../adapters/SiteAdapterRegistry"
import { AdapterCapability } from "../adapters/types"

interface Props {
  siteType: string
  url: string
  userId: string
  accessToken: string
  enabled: boolean
  rate: string
  onEnabledChange: (enabled: boolean) => void
  onRateChange: (rate: string) => void
}

export default function RevenueSettings({ siteType, url, userId, accessToken, enabled, rate, onEnabledChange, onRateChange }: Props) {
  const adapter = SiteAdapterRegistry.getInstance().getAdapter(siteType)
  const supported = adapter?.metadata.capabilities.includes(AdapterCapability.SITE_REVENUE) ?? false
  const [access, setAccess] = useState<{ granted: boolean; message: string }>({ granted: false, message: "待检测管理员权限" })
  const identity = `${siteType}|${url}|${userId}|${accessToken}`
  const [checkedIdentity, setCheckedIdentity] = useState("")
  const granted = checkedIdentity === identity && access.granted

  useEffect(() => {
    let cancelled = false
    if (!supported) {
      onEnabledChange(false)
      return
    }
    setAccess({ granted: false, message: "请填写站点地址、用户 ID 和访问令牌" })
    const isSub2Api = adapter?.metadata.id === "sub2api"
    if (!url.trim() || !accessToken.trim()) return
    if (!isSub2Api && (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0)) return
    setAccess({ granted: false, message: "正在检测管理员权限…" })
    const timer = setTimeout(async () => {
      try {
        const auth = isSub2Api
          ? { kind: "api-key" as const, apiKey: accessToken.trim() }
          : { kind: "one-api-token" as const, userId: Number(userId), accessToken: accessToken.trim() }
        const role = await adapter!.checkRevenueAccess!({ siteUrl: url.trim(), auth })
        if (!cancelled) {
          setCheckedIdentity(identity)
          setAccess({ granted: true, message: role >= 100 ? "已验证超级管理员权限" : "已验证管理员权限" })
        }
      } catch (error) {
        if (!cancelled) {
          setCheckedIdentity(identity)
          setAccess({ granted: false, message: error instanceof Error ? error.message : "权限检测失败" })
        }
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [adapter, supported, identity, url, userId, accessToken, onEnabledChange])

  return (
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <span id="revenue-setting-label" className="text-sm font-medium text-gray-700">统计站点营收</span>
        <button type="button" role="switch" aria-checked={enabled} aria-labelledby="revenue-setting-label"
          disabled={!enabled && !granted} onClick={() => onEnabledChange(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'left-0.5 translate-x-5' : 'left-0.5'}`} />
        </button>
      </div>
      <p role="status" className={`text-xs break-words ${granted ? 'text-green-700' : 'text-gray-500'}`}>
        {supported ? access.message : "当前站点类型暂不支持营收统计"}
      </p>
      {enabled && (
        <div>
          <label htmlFor="revenue-exchange-rate" className="mb-2 block text-sm text-gray-700">营收折算比例 (CNY/USD)</label>
          <input id="revenue-exchange-rate" type="number" min="0.01" max="100" step="0.01" required value={rate}
            onChange={event => onRateChange(event.target.value)}
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
        </div>
      )}
    </div>
  )
}
