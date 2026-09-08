# 方案提案：新增 Portunex 站点适配器

## 背景
需要在 One API Hub 中新增一个站点类型 `portunex`，用于展示账号余额（points）与今日用量统计。

Portunex API（需 Bearer token）：
- `GET https://api.portunex.gewulabs.group/portunex/users/me`
- `GET https://api.portunex.gewulabs.group/portunex/users/me/stats?start_time=...&end_time=...&granularity=hour`

## 目标
- 在适配器层新增 `PortunexAdapter`，支持：
  - 余额：`points`
  - 今日用量：`total_points_consumed` / `total_input_tokens` / `total_output_tokens` / `total_requests`
- 新增/编辑账号时允许输入 Bearer Token（session token）
- Portunex 的站点地址固定为 `https://portunex.gewulabs.group`（通过站点类型判定）

## 实现要点
- `adapters/PortunexAdapter.ts`：
  - 固定 API Base：`https://api.portunex.gewulabs.group`
  - `validateConnection()`：调用 `/portunex/users/me` 验证 token，并使用 `email` 作为 username 回填
  - `getAccountBalance()`：映射 `points -> BalanceInfo.rawBalance`
  - `getUsageStats()`：按本地“今日 00:00-23:59:59”范围换算 `start_time/end_time`（UTC ISO）并固定 `granularity=hour`
- 账号链路：
  - 保存/更新时将 token 持久化到 `account_info.api_key`
  - 缺少 token 时在刷新/调用处给出明确错误信息
- UI：
  - 新增/编辑账号选择 `portunex` 后，站点地址锁定为 `https://portunex.gewulabs.group`
  - 展示 `Bearer Token（session token）` 输入框，并要求必填

## 验收
- 新增 Portunex 账号可保存成功，且余额/今日用量在弹窗中正常展示
- `npm run build` 通过
