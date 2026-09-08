# account

## 订阅信息数据链路
1. `RightCodesAdapter.getAccountBalance()` → `BalanceInfo.extra`（订阅来源：`GET /subscriptions/list`）
2. 保存/更新：`AccountManager`；刷新：`accountStorage.refreshAccount()` —— 将 `extra` 中的订阅字段写入 `AccountInfo`：
   - `expire_time` / `subscription_status` / `daily_limit` / `plan_type` / `daily_used`
3. `accountStorage.convertToDisplayData()` 将 `AccountInfo` 转为 `DisplaySiteData.subscription: SubscriptionInfo`
4. `popup/index.tsx` 从所有账号里选择“最早到期”的订阅用于 BalanceSection 展示

## 时间单位
- `expire_time` 以秒时间戳为主；展示层对毫秒级数值做归一化（> 10_000_000_000 视为毫秒）。
