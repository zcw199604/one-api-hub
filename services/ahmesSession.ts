export type AhmesSnapshot = { me: any; wallet: any; daily: any[] }
type Result = { success: boolean; data?: AhmesSnapshot; error?: string }
let reader: ((url: string) => Promise<Result>) | undefined

export function setAhmesSnapshotReader(value: NonNullable<typeof reader>) { reader = value }
export function readAhmesSnapshot(url: string): Promise<Result> {
  return reader ? reader(url) : chrome.runtime.sendMessage({ action: "readAhmesSnapshot", url })
}

export async function readAhmesSnapshotInPage(origin: string): Promise<Result> {
  try {
    if (location.origin !== origin) throw new Error("站点发生跳转，无法读取 Ahmes 数据")
    const token = localStorage.getItem("prism.token")
    if (!token) throw new Error("请先在浏览器登录 Ahmes")
    const get = async (path: string) => {
      const response = await fetch(`${origin}${path}`, {
        method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.status === 401 ? "Ahmes 登录已失效，请重新登录" : path}`)
      return response.json()
    }
    const [me, wallet, daily] = await Promise.all([get("/api/me"), get("/api/wallet"), get("/api/usage/daily?days=1")])
    if (location.origin !== origin || localStorage.getItem("prism.token") !== token) throw new Error("Ahmes 登录账号已变化，请重试")
    if (!Array.isArray(daily)) throw new Error("Ahmes 今日用量格式异常")
    return { success: true, data: { me: { id: me?.id, email: me?.email }, wallet: { balance_micros: wallet?.balance_micros }, daily } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "读取 Ahmes 数据失败" }
  }
}
