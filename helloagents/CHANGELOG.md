# CHANGELOG

## [Unreleased]

### 新增
- **[Sub2API]**: 新增 Sub2API 站点适配器，支持自动识别、美元余额、今日用量及 API Key 管理（列表、复制、创建、编辑、删除、状态、额度和访问限制）
- **[Sub2API]**: 余额和 Key 操作支持 401 后恢复浏览器凭据，协调刷新令牌轮换、校验账号身份并保存新访问 Token；写操作不因网络或 5xx 错误重复执行
- **[测试]**: 补充 23 个 Sub2API 凭据续期和 Key 管理回归用例，覆盖分页、美元额度、字段保留、并发续期及 OneAPI 路由兼容
- **[Portunex]**: 新增 Portunex 站点适配器（余额/今日用量），并支持在新增/编辑账号时填写 Bearer Token
  - 方案: [202601271919_portunex-adapter](archive/2026-01/202601271919_portunex-adapter/)

## [0.0.5] - 2026-01-22

### 新增
- **[Popup]**: 今日消耗按订阅套餐/按量付费拆分展示
  - 方案: [202601222014_consumption-breakdown](archive/2026-01/202601222014_consumption-breakdown/)

### 修复
- **[Right.codes]**: 改用 `/subscriptions/list` 拉取订阅信息，修复订阅信息不显示
  - 方案: [202601221824_rightcodes-subscriptions-list](archive/2026-01/202601221824_rightcodes-subscriptions-list/)
- **[Popup]**: 修复“订阅信息”Tab 的选中/持久化映射，并在无订阅时自动回退到合法 Tab
  - 方案: [202601221659_subscription-tab](archive/2026-01/202601221659_subscription-tab/)
- **[Account]**: 刷新/保存/更新 Right.codes 账号时同步订阅字段，避免订阅信息不更新
  - 方案: [202601221659_subscription-tab](archive/2026-01/202601221659_subscription-tab/)
- **[Types]**: 引入 `BalanceTab`/`SubscriptionInfo`，修复 TypeScript 类型错误并减少 `any`
  - 方案: [202601221659_subscription-tab](archive/2026-01/202601221659_subscription-tab/)
