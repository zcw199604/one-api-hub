/**
 * 额度检测功能 - 存储服务
 * 使用 chrome.storage.local 存储 API Key 列表
 */

import type { SavedApiKey, ApiKeyQuotaInfo } from "../types/quotaCheck"

const STORAGE_KEY = "savedApiKeys"

/**
 * 生成唯一 ID
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 获取所有保存的 API Key
 */
export const getSavedApiKeys = async (): Promise<SavedApiKey[]> => {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY] || []
  } catch (error) {
    console.error("获取 API Key 列表失败:", error)
    return []
  }
}

/**
 * 保存新的 API Key
 */
export const addApiKey = async (
  data: Omit<SavedApiKey, "id" | "createdAt">
): Promise<SavedApiKey> => {
  const keys = await getSavedApiKeys()

  const newKey: SavedApiKey = {
    ...data,
    id: generateId(),
    createdAt: Date.now()
  }

  keys.push(newKey)
  await chrome.storage.local.set({ [STORAGE_KEY]: keys })

  return newKey
}

/**
 * 更新已有的 API Key
 */
export const updateApiKey = async (
  id: string,
  data: Partial<Omit<SavedApiKey, "id" | "createdAt">>
): Promise<boolean> => {
  const keys = await getSavedApiKeys()
  const index = keys.findIndex((k) => k.id === id)

  if (index === -1) {
    return false
  }

  keys[index] = { ...keys[index], ...data }
  await chrome.storage.local.set({ [STORAGE_KEY]: keys })

  return true
}

/**
 * 删除 API Key
 */
export const deleteApiKey = async (id: string): Promise<boolean> => {
  const keys = await getSavedApiKeys()
  const filteredKeys = keys.filter((k) => k.id !== id)

  if (filteredKeys.length === keys.length) {
    return false
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: filteredKeys })
  return true
}

/**
 * 更新 API Key 的额度检测结果
 */
export const updateQuotaInfo = async (
  id: string,
  quotaInfo: ApiKeyQuotaInfo
): Promise<boolean> => {
  return updateApiKey(id, {
    lastCheckedAt: Date.now(),
    lastQuotaInfo: quotaInfo
  })
}

/**
 * 根据 ID 获取单个 API Key
 */
export const getApiKeyById = async (id: string): Promise<SavedApiKey | null> => {
  const keys = await getSavedApiKeys()
  return keys.find((k) => k.id === id) || null
}
