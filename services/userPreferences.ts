import { Storage } from "@plasmohq/storage";
import type { BalanceTab } from "../types";

// 用户偏好设置类型定义
export interface UserPreferences {
  // BalanceSection 相关配置
  activeTab: BalanceTab;  // 金额标签页状态
  currencyType: 'USD' | 'CNY';           // 金额单位

  // AccountList 相关配置
  sortField: 'name' | 'balance' | 'consumption';  // 排序字段
  sortOrder: 'asc' | 'desc';                      // 排序顺序

  // 自动刷新相关配置
  autoRefresh: boolean;                  // 是否启用定时自动刷新
  refreshInterval: number;               // 刷新间隔（秒）
  refreshOnOpen: boolean;                // 打开插件时自动刷新
  showHealthStatus: boolean;             // 是否显示健康状态

  // 其他配置可在此扩展
  lastUpdated: number;  // 最后更新时间
}

// 存储键名常量
const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_preferences'
} as const;

// 默认配置
const DEFAULT_PREFERENCES: UserPreferences = {
  activeTab: 'consumption',
  currencyType: 'CNY',
  sortField: 'balance',  // 与 UI_CONSTANTS.SORT.DEFAULT_FIELD 保持一致
  sortOrder: 'desc',     // 与 UI_CONSTANTS.SORT.DEFAULT_ORDER 保持一致
  autoRefresh: true,     // 默认启用自动刷新
  refreshInterval: 360,  // 默认360秒刷新间隔
  refreshOnOpen: true,   // 默认打开插件时自动刷新
  showHealthStatus: true,// 默认显示健康状态
  lastUpdated: Date.now()
};

class UserPreferencesService {
  private storage: Storage;

  constructor() {
    this.storage = new Storage({
      area: "local"
    });
  }

  /**
   * 获取用户偏好设置
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      const preferences = await this.storage.get(STORAGE_KEYS.USER_PREFERENCES) as UserPreferences;
      return preferences || DEFAULT_PREFERENCES;
    } catch (error) {
      console.error('获取用户偏好设置失败:', error);
      return DEFAULT_PREFERENCES;
    }
  }

  /**
   * 保存用户偏好设置
   */
  async savePreferences(preferences: Partial<UserPreferences>): Promise<boolean> {
    try {
      const currentPreferences = await this.getPreferences();
      const updatedPreferences: UserPreferences = {
        ...currentPreferences,
        ...preferences,
        lastUpdated: Date.now()
      };

      await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, updatedPreferences);
      console.log('[UserPreferences] 偏好设置保存成功:', updatedPreferences);
      return true;
    } catch (error) {
      console.error('[UserPreferences] 保存偏好设置失败:', error);
      return false;
    }
  }

  /**
   * 更新活动标签页
   */
  async updateActiveTab(activeTab: BalanceTab): Promise<boolean> {
    return this.savePreferences({ activeTab });
  }

  /**
   * 更新货币类型
   */
  async updateCurrencyType(currencyType: 'USD' | 'CNY'): Promise<boolean> {
    return this.savePreferences({ currencyType });
  }

  /**
   * 更新排序配置
   */
  async updateSortConfig(sortField: 'name' | 'balance' | 'consumption', sortOrder: 'asc' | 'desc'): Promise<boolean> {
    return this.savePreferences({ sortField, sortOrder });
  }

  /**
   * 更新自动刷新设置
   */
  async updateAutoRefreshSettings(settings: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    refreshOnOpen?: boolean;
    showHealthStatus?: boolean;
  }): Promise<boolean> {
    return this.savePreferences(settings);
  }

  /**
   * 更新自动刷新开关
   */
  async updateAutoRefresh(autoRefresh: boolean): Promise<boolean> {
    return this.savePreferences({ autoRefresh });
  }

  /**
   * 更新刷新间隔
   */
  async updateRefreshInterval(refreshInterval: number): Promise<boolean> {
    return this.savePreferences({ refreshInterval });
  }

  /**
   * 更新打开插件时自动刷新设置
   */
  async updateRefreshOnOpen(refreshOnOpen: boolean): Promise<boolean> {
    return this.savePreferences({ refreshOnOpen });
  }

  /**
   * 更新健康状态显示设置
   */
  async updateShowHealthStatus(showHealthStatus: boolean): Promise<boolean> {
    return this.savePreferences({ showHealthStatus });
  }

  /**
   * 重置为默认设置
   */
  async resetToDefaults(): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, DEFAULT_PREFERENCES);
      console.log('[UserPreferences] 已重置为默认设置');
      return true;
    } catch (error) {
      console.error('[UserPreferences] 重置设置失败:', error);
      return false;
    }
  }

  /**
   * 清空偏好设置
   */
  async clearPreferences(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEYS.USER_PREFERENCES);
      console.log('[UserPreferences] 偏好设置已清空');
      return true;
    } catch (error) {
      console.error('[UserPreferences] 清空偏好设置失败:', error);
      return false;
    }
  }

  /**
   * 导出偏好设置
   */
  async exportPreferences(): Promise<UserPreferences> {
    return this.getPreferences();
  }

  /**
   * 导入偏好设置
   */
  async importPreferences(preferences: UserPreferences): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, {
        ...preferences,
        lastUpdated: Date.now()
      });
      console.log('[UserPreferences] 偏好设置导入成功');
      return true;
    } catch (error) {
      console.error('[UserPreferences] 导入偏好设置失败:', error);
      return false;
    }
  }
}

// 创建单例实例
export const userPreferences = new UserPreferencesService();

// 工具函数
export const UserPreferencesUtils = {
  /**
   * 验证偏好设置数据
   */
  validatePreferences(preferences: Partial<UserPreferences>): string[] {
    const errors: string[] = [];

    if (preferences.activeTab && !['consumption', 'balance', 'subscription'].includes(preferences.activeTab)) {
      errors.push('activeTab 必须是 "consumption" / "balance" / "subscription"');
    }

    if (preferences.currencyType && !['USD', 'CNY'].includes(preferences.currencyType)) {
      errors.push('currencyType 必须是 "USD" 或 "CNY"');
    }

    if (preferences.sortField && !['name', 'balance', 'consumption'].includes(preferences.sortField)) {
      errors.push('sortField 必须是 "name", "balance" 或 "consumption"');
    }

    if (preferences.sortOrder && !['asc', 'desc'].includes(preferences.sortOrder)) {
      errors.push('sortOrder 必须是 "asc" 或 "desc"');
    }

    if (preferences.autoRefresh !== undefined && typeof preferences.autoRefresh !== 'boolean') {
      errors.push('autoRefresh 必须是布尔值');
    }

    if (preferences.refreshInterval !== undefined) {
      if (typeof preferences.refreshInterval !== 'number' || preferences.refreshInterval < 10) {
        errors.push('refreshInterval 必须大于等于10秒');
      }
    }

    if (preferences.refreshOnOpen !== undefined && typeof preferences.refreshOnOpen !== 'boolean') {
      errors.push('refreshOnOpen 必须是布尔值');
    }

    if (preferences.showHealthStatus !== undefined && typeof preferences.showHealthStatus !== 'boolean') {
      errors.push('showHealthStatus 必须是布尔值');
    }

    return errors;
  },

  /**
   * 获取标签页的显示名称
   */
  getTabDisplayName(tab: BalanceTab): string {
    switch (tab) {
      case 'consumption': return '今日消耗';
      case 'balance': return '总余额';
      case 'subscription': return '订阅信息';
      default: return '未知';
    }
  },

  /**
   * 获取货币类型的显示符号
   */
  getCurrencySymbol(currency: 'USD' | 'CNY'): string {
    return currency === 'USD' ? '$' : '¥';
  },

  /**
   * 获取排序字段的显示名称
   */
  getSortFieldDisplayName(field: 'name' | 'balance' | 'consumption'): string {
    switch (field) {
      case 'name': return '账号名称';
      case 'balance': return '余额';
      case 'consumption': return '今日消耗';
      default: return '未知';
    }
  },

  /**
   * 获取排序顺序的显示名称
   */
  getSortOrderDisplayName(order: 'asc' | 'desc'): string {
    return order === 'asc' ? '升序' : '降序';
  }
};
