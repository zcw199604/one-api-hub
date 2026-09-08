import type { ISiteAdapter } from "../adapters/ISiteAdapter"
import type { SiteCredentials, TimeRange } from "../adapters/types"
import { recoverSub2ApiCredentials } from "./sub2apiSession"

// Refresh both queries as one operation so their simultaneous 401s only recover once.
export async function fetchAccountSnapshot(
  adapter: ISiteAdapter,
  credentials: SiteCredentials,
  timeRange: TimeRange,
  storedUserId: number | string | undefined,
  saveToken: (token: string) => Promise<void>
) {
  const query = () => Promise.all([
    adapter.getAccountBalance?.(credentials) ?? Promise.resolve(null),
    adapter.getUsageStats?.(credentials, timeRange) ?? Promise.resolve(null)
  ] as const)
  return withCredentialRecovery(adapter, credentials, storedUserId, saveToken, query)
}

// Only a definite 401 is retried; network/5xx failures may follow an applied write.
export async function withCredentialRecovery<T>(
  adapter: ISiteAdapter,
  credentials: SiteCredentials,
  storedUserId: number | string | undefined,
  saveToken: (token: string) => Promise<void>,
  query: () => Promise<T>
): Promise<T> {
  try {
    return await query()
  } catch (error) {
    if (adapter.metadata.id !== "sub2api" || (error as { status?: number })?.status !== 401 ||
        credentials.auth.kind !== "api-key") throw error
    const failedToken = credentials.auth.apiKey.replace(/^bearer\s+/i, "").trim()
    let expectedUserId = Number.isSafeInteger(Number(storedUserId)) && Number(storedUserId) > 0
      ? String(storedUserId) : ""
    if (!expectedUserId) {
      // Older saved accounts lack an ID. JWT claims identify the intended account only;
      // the replacement token is independently checked against the server's profile.
      try {
        const segment = failedToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        const claims = JSON.parse(atob(segment))
        if (Number.isSafeInteger(claims.user_id) && claims.user_id > 0) expectedUserId = String(claims.user_id)
      } catch { /* require re-identification below */ }
    }
    if (!expectedUserId) throw new Error("无法确认 Sub2API 账号身份，请编辑账号重新识别并保存")
    const result = await recoverSub2ApiCredentials({
      url: credentials.siteUrl, expectedUserId, failedToken
    })
    if (!result?.success || !result.token) throw new Error(result?.error || "Sub2API 凭据更新失败")
    // Persist before retry: even if usage fails, don't lose the recovered credential.
    await saveToken(result.token)
    credentials.auth = { kind: "api-key", apiKey: result.token }
    return await query()
  }
}
