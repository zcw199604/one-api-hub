import { useState, useEffect, useCallback } from 'react';
import type { BalanceTab } from '../types';
import { userPreferences, type UserPreferences } from '../services/userPreferences';

/**
 * 用户偏好设置管理Hook
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 加载偏好设置
  const loadPreferences = useCallback(async () => {
    try {
      setIsLoading(true);
      const prefs = await userPreferences.getPreferences();
      setPreferences(prefs);
      console.log('[useUserPreferences] 偏好设置加载成功:', prefs);
    } catch (error) {
      console.error('[useUserPreferences] 加载偏好设置失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // 更新活动标签页
  const updateActiveTab = useCallback(async (activeTab: BalanceTab) => {
    try {
      const success = await userPreferences.updateActiveTab(activeTab);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, activeTab } : null);
        console.log('[useUserPreferences] 活动标签页更新成功:', activeTab);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新活动标签页失败:', error);
      return false;
    }
  }, [preferences]);

  // 更新货币类型
  const updateCurrencyType = useCallback(async (currencyType: 'USD' | 'CNY') => {
    try {
      const success = await userPreferences.updateCurrencyType(currencyType);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, currencyType } : null);
        console.log('[useUserPreferences] 货币类型更新成功:', currencyType);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新货币类型失败:', error);
      return false;
    }
  }, [preferences]);

  // 更新排序配置
  const updateSortConfig = useCallback(async (sortField: 'name' | 'balance' | 'consumption', sortOrder: 'asc' | 'desc') => {
    try {
      const success = await userPreferences.updateSortConfig(sortField, sortOrder);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, sortField, sortOrder } : null);
        console.log('[useUserPreferences] 排序配置更新成功:', { sortField, sortOrder });
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新排序配置失败:', error);
      return false;
    }
  }, [preferences]);

  // 更新自动刷新设置
  const updateAutoRefresh = useCallback(async (autoRefresh: boolean) => {
    try {
      const success = await userPreferences.updateAutoRefresh(autoRefresh);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, autoRefresh } : null);
        console.log('[useUserPreferences] 自动刷新设置更新成功:', autoRefresh);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新自动刷新设置失败:', error);
      return false;
    }
  }, [preferences]);

  // 更新刷新间隔
  const updateRefreshInterval = useCallback(async (refreshInterval: number) => {
    try {
      const success = await userPreferences.updateRefreshInterval(refreshInterval);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, refreshInterval } : null);
        console.log('[useUserPreferences] 刷新间隔更新成功:', refreshInterval);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新刷新间隔失败:', error);
      return false;
    }
  }, [preferences]);

  // 更新打开插件时自动刷新设置
  const updateRefreshOnOpen = useCallback(async (refreshOnOpen: boolean) => {
    try {
      const success = await userPreferences.updateRefreshOnOpen(refreshOnOpen);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, refreshOnOpen } : null);
        console.log('[useUserPreferences] 打开插件时自动刷新设置更新成功:', refreshOnOpen);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新打开插件时自动刷新设置失败:', error);
      return false;
    }
  }, [preferences]);

  // 更新健康状态显示设置
  const updateShowHealthStatus = useCallback(async (showHealthStatus: boolean) => {
    try {
      const success = await userPreferences.updateShowHealthStatus(showHealthStatus);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, showHealthStatus } : null);
        console.log('[useUserPreferences] 健康状态显示设置更新成功:', showHealthStatus);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 更新健康状态显示设置失败:', error);
      return false;
    }
  }, [preferences]);

  // 批量更新偏好设置
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    try {
      const success = await userPreferences.savePreferences(updates);
      if (success && preferences) {
        setPreferences(prev => prev ? { ...prev, ...updates } : null);
        console.log('[useUserPreferences] 偏好设置批量更新成功:', updates);
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 批量更新偏好设置失败:', error);
      return false;
    }
  }, [preferences]);

  // 重置为默认设置
  const resetToDefaults = useCallback(async () => {
    try {
      const success = await userPreferences.resetToDefaults();
      if (success) {
        await loadPreferences(); // 重新加载设置
        console.log('[useUserPreferences] 已重置为默认设置');
      }
      return success;
    } catch (error) {
      console.error('[useUserPreferences] 重置设置失败:', error);
      return false;
    }
  }, [loadPreferences]);

  return {
    // 状态
    preferences,
    isLoading,

    // 便捷访问属性
    activeTab: preferences?.activeTab || 'consumption',
    currencyType: preferences?.currencyType || 'USD',
    sortField: preferences?.sortField || 'name',
    sortOrder: preferences?.sortOrder || 'asc',
    autoRefresh: preferences?.autoRefresh ?? true,
    refreshInterval: preferences?.refreshInterval ?? 360,
    refreshOnOpen: preferences?.refreshOnOpen ?? true,
    showHealthStatus: preferences?.showHealthStatus ?? true,

    // 操作方法
    updateActiveTab,
    updateCurrencyType,
    updateSortConfig,
    updateAutoRefresh,
    updateRefreshInterval,
    updateRefreshOnOpen,
    updateShowHealthStatus,
    updatePreferences,
    resetToDefaults,
    loadPreferences
  };
}