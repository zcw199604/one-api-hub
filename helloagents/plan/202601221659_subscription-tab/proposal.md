# 方案提案：订阅信息标签页与订阅字段链路修复

## 背景
当前已引入 Right.codes 的包月订阅字段与 UI 展示，但存在：
- TypeScript 类型不一致导致 `tsc` 失败
- BalanceSection 增加第 3 个 Tab 后，`activeTab`/`selectedIndex`/持久化映射仍按 2 个 Tab 处理，导致“订阅信息”Tab 无法正常选中与保存
- `extra`/订阅对象存在 `any` 推断与过宽类型，降低类型安全
- 刷新账号时未同步 Right.codes 订阅字段，导致订阅信息可能不会更新

## 目标
- 修复 `tsc` 报错并恢复类型检查通过
- 让“订阅信息”Tab 在存在订阅时可选中、可持久化；无订阅时自动回退到合法 Tab
- 订阅信息类型化（SubscriptionInfo），减少 `any`
- Right.codes 刷新流程同步订阅字段

## 实现要点
- 新增共享类型：`BalanceTab`、`SubscriptionInfo`
- 偏好设置 `activeTab` 扩展为三态（含 subscription）
- BalanceSection：根据是否存在订阅动态计算 `selectedIndex`，并仅在存在订阅时渲染第 3 个 Tab
- Popup：
  - 从 `displayData` 中提取最早到期订阅作为展示对象
  - `onChange(index)` 映射到三态 tab，并在无订阅时回退
  - 当偏好值为 subscription 但当前无订阅时，自动修正为 balance
- Right.codes：订阅字段通过 `BalanceInfo.extra` 传递；AccountManager 在保存/更新/刷新时写入 `AccountInfo` 订阅字段

## 风险与兼容性
- Right.codes `expire_time` 时间单位需以 API 返回为准；展示层已对毫秒级时间戳做归一化处理。

## 验收
- `npx tsc -p tsconfig.json --noEmit` 通过
- 存在订阅时：可切换到“订阅信息”Tab 且刷新/重开后仍保持
- 无订阅时：不会停留在 subscription Tab（自动回退）
