# 任务清单：订阅信息标签页与订阅字段链路修复

- [√] 修复 TypeScript 类型不一致（SubscriptionInfo/BalanceTab）
- [√] 修复 BalanceSection 第 3 个 Tab 的 selectedIndex 映射
- [√] 修复 Popup 的 Tab index → activeTab 映射与持久化
- [√] 订阅信息提取逻辑类型化（选择最早到期订阅）
- [√] accountStorage 订阅对象强类型 + expire_time 秒/毫秒归一化
- [√] AccountManager 刷新/保存/更新同步 Right.codes 订阅字段
- [√] 类型检查：`npx tsc -p tsconfig.json --noEmit`
