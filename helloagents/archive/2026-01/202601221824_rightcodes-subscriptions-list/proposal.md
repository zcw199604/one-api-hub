# 方案提案：Right.codes 订阅信息改用 /subscriptions/list

## 背景
当前 Right.codes 的订阅信息并不稳定/不出现在 `/auth/me`，导致 UI 的「订阅信息」Tab 不出现。

用户提供的接口文档显示订阅数据位于：`GET /subscriptions/list`。

## 目标
- Right.codes 订阅信息从 `/subscriptions/list` 获取并写入现有字段链路（`expire_time` / `daily_limit` / `daily_used` / `plan_type`）
- UI 能正常出现并展示订阅到期时间、套餐名称与额度

## 实现要点
- `RightCodesAdapter.getAccountBalance()`：
  - 仍通过 `/auth/me` 获取余额
  - 额外请求 `/subscriptions/list`，解析 `expired_at`/`total_quota`/`remaining_quota`/`name`
  - 将解析结果写入 `BalanceInfo.extra`（订阅请求成功但无订阅时会清空旧值；请求失败则不覆盖）

## 验收
- 刷新账号后，弹窗出现「订阅信息」Tab，并展示到期时间/套餐/额度
- `npx tsc -p tsconfig.json --noEmit` 通过
