import type { Sub2ApiKey, Sub2ApiKeyInput } from "../adapters/sub2apiKeys"

export const emptySub2ApiKeyForm = { name: "", group: "", quota: "0", expiry: "", days: "", status: "active",
  whitelist: "", blacklist: "", limit5h: "0", limit1d: "0", limit7d: "0" }

export function sub2ApiKeyForm(key: Sub2ApiKey) {
  const expiry = key.expires_at ? new Date(key.expires_at) : null
  const localExpiry = expiry ? new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""
  return { name: key.name, group: key.group_id == null ? "" : String(key.group_id),
    quota: String(key.quota), expiry: localExpiry, days: "", status: key.status as string,
    whitelist: (key.ip_whitelist || []).join("\n"), blacklist: (key.ip_blacklist || []).join("\n"),
    limit5h: String(key.rate_limit_5h || 0), limit1d: String(key.rate_limit_1d || 0), limit7d: String(key.rate_limit_7d || 0) }
}

export function buildSub2ApiKeyInput(form: typeof emptySub2ApiKeyForm, original: Sub2ApiKey | null): Sub2ApiKeyInput {
  const amount = (value: string) => {
    const number = Number(value)
    if (!value.trim() || !Number.isFinite(number) || number < 0) throw new Error("额度必须是非负金额")
    return number
  }
  const splitIps = (value: string) => value.split(/[\s,]+/).filter(Boolean)
  const config: Sub2ApiKeyInput = {
    name: form.name.trim(), quota: amount(form.quota),
    ip_whitelist: splitIps(form.whitelist), ip_blacklist: splitIps(form.blacklist),
    rate_limit_5h: amount(form.limit5h), rate_limit_1d: amount(form.limit1d), rate_limit_7d: amount(form.limit7d)
  }
  if (!config.name) throw new Error("请输入密钥名称")
  // Omitting an unchanged group also allows edits after a group's availability changes.
  if (form.group && (!original || form.group !== String(original.group_id))) {
    const id = Number(form.group)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("请选择有效分组")
    config.group_id = id
  }
  if (original) {
    // Preserve the server's timestamp precision when the field was not edited.
    if (form.expiry !== sub2ApiKeyForm(original).expiry) {
      config.expires_at = form.expiry ? new Date(form.expiry).toISOString() : ""
    }
    if (form.status !== original.status && (form.status === "active" || form.status === "inactive")) config.status = form.status
  } else if (form.days) {
    const days = Number(form.days)
    if (!Number.isSafeInteger(days) || days <= 0) throw new Error("有效天数必须为正整数")
    config.expires_in_days = days
  }
  return config
}
