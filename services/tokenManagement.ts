import { SiteAdapterRegistry } from "../adapters/SiteAdapterRegistry"
import { Sub2ApiAdapter } from "../adapters/Sub2ApiAdapter"
import { AdapterCapability, type SiteCredentials, type ApiToken } from "../adapters/types"
import type { ISiteAdapter } from "../adapters/ISiteAdapter"
import { accountStorage } from "./accountStorage"
import { fetchTokensTodayUsage } from "./apiService"
import { withCredentialRecovery } from "./fetchAccountSnapshot"

export async function withTokenAccount<T>(id: string, operation: (adapter: ISiteAdapter, credentials: SiteCredentials) => Promise<T>): Promise<T> {
  const account = await accountStorage.getAccountById(id)
  if (!account) throw new Error("账号不存在")
  const adapter = SiteAdapterRegistry.getInstance().getAdapter(account.site_type || "one-api")
  if (!adapter?.metadata.capabilities.includes(AdapterCapability.TOKEN_MANAGEMENT)) throw new Error("该账号不支持密钥管理")
  const info = account.account_info
  const credentials: SiteCredentials = {
    siteUrl: account.site_url,
    auth: info.api_key ? { kind: "api-key", apiKey: info.api_key } : {
      kind: "one-api-token", userId: Number(info.id), accessToken: info.access_token || ""
    }
  }
  return withCredentialRecovery(adapter, credentials, info.id, async token => {
    const latest = await accountStorage.getAccountById(id)
    if (!latest || latest.site_url !== account.site_url || latest.site_type !== account.site_type ||
        (latest.account_info.api_key !== info.api_key && latest.account_info.api_key !== token)) {
      throw new Error("账号凭据已变化，请重新操作")
    }
    if (!await accountStorage.updateAccount(id, { account_info: { ...latest.account_info, api_key: token } })) {
      throw new Error("保存 Sub2API 新凭据失败")
    }
  }, () => operation(adapter, credentials))
}

export function withSub2ApiKeys<T>(id: string, operation: (adapter: Sub2ApiAdapter, credentials: SiteCredentials) => Promise<T>): Promise<T> {
  return withTokenAccount(id, (adapter, credentials) => {
    if (!(adapter instanceof Sub2ApiAdapter)) throw new Error("该账号不是 Sub2API")
    return operation(adapter, credentials)
  })
}

export function listAccountKeys(id: string): Promise<ApiToken[]> {
  return withTokenAccount(id, (adapter, credentials) => adapter.getApiTokens!(credentials))
}

export function deleteAccountKey(id: string, keyId: number): Promise<boolean> {
  return withTokenAccount(id, (adapter, credentials) => adapter.deleteApiToken!(credentials, String(keyId)))
}

export function loadAccountKeyUsage(id: string, keys: ApiToken[]): Promise<Map<number, number>> {
  return withTokenAccount(id, async (adapter, credentials) => {
    if (adapter instanceof Sub2ApiAdapter) {
      const stats = await adapter.getKeysUsage(credentials, keys.map(key => key.id))
      return new Map(keys.map(key => [key.id, stats[String(key.id)]?.today_actual_cost ?? 0]))
    }
    if (credentials.auth.kind !== "one-api-token") throw new Error("账号鉴权类型不支持今日用量")
    const stats = await fetchTokensTodayUsage(credentials.siteUrl, credentials.auth.userId, credentials.auth.accessToken)
    return new Map(keys.map(key => [key.id, stats.get(key.name)?.today_quota_consumption ?? 0]))
  })
}

export function keyForClipboard(key: string, siteType?: string): string {
  return siteType === "sub2api" || key.startsWith("sk-") ? key : `sk-${key}`
}
