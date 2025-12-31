/**
 * 账号操作服务模块
 * 
 * 作用：
 * 1. 提供账号自动识别功能，通过 Chrome 扩展 API 获取站点用户信息
 * 2. 处理账号的验证、保存和更新操作
 * 3. 封装账号数据的存储逻辑，包括余额获取和数据同步
 * 
 * 主要功能：
 * - autoDetectAccount: 自动识别站点账号信息（用户名、令牌、用户ID等）
 * - validateAndSaveAccount: 验证并保存新账号到本地存储
 * - validateAndUpdateAccount: 验证并更新现有账号信息
 * - extractDomainPrefix: 从域名提取站点名称
 * - isValidExchangeRate: 验证汇率输入的有效性
 * 
 * 工作流程：
 * 1. 通过 background script 创建临时窗口访问目标站点
 * 2. 使用 content script 从站点获取用户信息
 * 3. 调用 API 获取访问令牌和账号数据
 * 4. 保存或更新账号信息到本地存储
 * 
 * 依赖：
 * - AccountManager: 统一调度适配器与存储
 */

import { AccountManager, type AccountSaveResult, type AccountValidationResult, type ValidateAndSaveParams } from "./AccountManager"

// 自动检测账号信息
export async function autoDetectAccount(url: string, siteType?: string): Promise<AccountValidationResult> {
  return AccountManager.getInstance().autoDetectAccount(url, siteType)
}

// 验证并保存账号信息（用于新增）
export async function validateAndSaveAccount(
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  siteType: string = "one-api"
): Promise<AccountSaveResult> {
  return validateAndSaveAccountV2({
    siteType,
    url,
    siteName,
    username,
    accessToken,
    userId,
    exchangeRate
  })
}

// 验证并更新账号信息（用于编辑）
export async function validateAndUpdateAccount(
  accountId: string,
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  siteType: string = "one-api"
): Promise<AccountSaveResult> {
  return validateAndUpdateAccountV2(accountId, {
    siteType,
    url,
    siteName,
    username,
    accessToken,
    userId,
    exchangeRate
  })
}

export async function validateAndSaveAccountV2(params: ValidateAndSaveParams): Promise<AccountSaveResult> {
  return AccountManager.getInstance().validateAndSaveAccount(params)
}

export async function validateAndUpdateAccountV2(
  accountId: string,
  params: ValidateAndSaveParams
): Promise<AccountSaveResult> {
  return AccountManager.getInstance().validateAndUpdateAccount(accountId, params)
}

// 提取域名的主要部分（一级域名前缀）
export function extractDomainPrefix(hostname: string): string {
  if (!hostname) return ""
  
  // 移除 www. 前缀
  const withoutWww = hostname.replace(/^www\./, "")
  
  // 处理子域名情况，例如：xxx.xx.google.com -> google
  const parts = withoutWww.split(".")
  if (parts.length >= 2) {
    // 如果是常见的二级域名（如 .com.cn, .co.uk 等），取倒数第三个部分
    const lastPart = parts[parts.length - 1]
    const secondLastPart = parts[parts.length - 2]
    
    // 检查是否为双重后缀
    const doubleSuffixes = ['com', 'net', 'org', 'gov', 'edu', 'co']
    if (parts.length >= 3 && doubleSuffixes.includes(secondLastPart) && lastPart.length === 2) {
      // 首字母大写
      return parts[parts.length - 3].charAt(0).toUpperCase() + parts[parts.length - 3].slice(1)
    }
    
    // 否则返回倒数第二个部分
    return secondLastPart.charAt(0).toUpperCase() + secondLastPart.slice(1)
  }
  
  return withoutWww.charAt(0).toUpperCase() + withoutWww.slice(1)
}

// 验证充值比例是否有效
export function isValidExchangeRate(rate: string): boolean {
  const num = parseFloat(rate)
  return !isNaN(num) && num > 0 && num <= 100
}
