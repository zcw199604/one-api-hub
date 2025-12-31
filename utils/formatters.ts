import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import "dayjs/locale/zh-cn"
import { UI_CONSTANTS, CURRENCY_SYMBOLS } from "../constants/ui"
import type { DisplaySiteData } from "../types"

// 初始化 dayjs
dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

/**
 * 格式化 Token 数量
 */
export const formatTokenCount = (count: number): string => {
  if (count >= UI_CONSTANTS.TOKEN.MILLION_THRESHOLD) {
    return (count / UI_CONSTANTS.TOKEN.MILLION_THRESHOLD).toFixed(1) + 'M'
  } else if (count >= UI_CONSTANTS.TOKEN.THOUSAND_THRESHOLD) {
    return (count / UI_CONSTANTS.TOKEN.THOUSAND_THRESHOLD).toFixed(1) + 'K'
  }
  return count.toString()
}

/**
 * 格式化相对时间
 */
export const formatRelativeTime = (date: Date): string => {
  const now = dayjs()
  const targetTime = dayjs(date)
  const diffInSeconds = now.diff(targetTime, 'second')
  
  if (diffInSeconds < 5) {
    return '刚刚'
  }
  return targetTime.fromNow()
}

/**
 * 格式化具体时间
 */
export const formatFullTime = (date: Date): string => {
  return dayjs(date).format('YYYY/MM/DD HH:mm:ss')
}

/**
 * 计算总消耗
 * 直接使用 displayData 中已转换的值，确保各站点使用正确的 conversionFactor
 */
export const calculateTotalConsumption = (
  displayData: DisplaySiteData[]
) => {
  return {
    USD: parseFloat(displayData.reduce((sum, site) => sum + site.todayConsumption.USD, 0).toFixed(2)),
    CNY: parseFloat(displayData.reduce((sum, site) => sum + site.todayConsumption.CNY, 0).toFixed(2))
  }
}

/**
 * 计算总余额
 */
export const calculateTotalBalance = (
  displayData: DisplaySiteData[]
) => {
  return {
    USD: parseFloat(displayData.reduce((sum, site) => sum + site.balance.USD, 0).toFixed(2)),
    CNY: parseFloat(displayData.reduce((sum, site) => sum + site.balance.CNY, 0).toFixed(2))
  }
}

/**
 * 获取货币符号
 */
export const getCurrencySymbol = (currencyType: 'USD' | 'CNY'): string => {
  return CURRENCY_SYMBOLS[currencyType]
}

/**
 * 获取货币显示名称
 */
export const getCurrencyDisplayName = (currencyType: 'USD' | 'CNY'): string => {
  return currencyType === 'USD' ? '美元' : '人民币'
}

/**
 * 获取切换后的货币类型
 */
export const getOppositeCurrency = (currencyType: 'USD' | 'CNY'): 'USD' | 'CNY' => {
  return currencyType === 'USD' ? 'CNY' : 'USD'
}

/**
 * 生成排序比较函数
 */
export const createSortComparator = <T>(
  field: keyof T,
  order: 'asc' | 'desc'
) => {
  return (a: T, b: T): number => {
    const aValue = a[field]
    const bValue = b[field]
    
    if (order === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
    }
  }
}

/**
 * 生成唯一ID
 */
export const generateId = (prefix = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 防抖函数
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void => {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * 节流函数
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void => {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}