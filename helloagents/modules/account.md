# account

## 订阅信息数据链路
1. `RightCodesAdapter.getAccountBalance()` → `BalanceInfo.extra`（订阅来源：`GET /subscriptions/list`）
2. 保存/更新：`AccountManager`；刷新：`accountStorage.refreshAccount()` —— 将 `extra` 中的订阅字段写入 `AccountInfo`：
   - `expire_time` / `subscription_status` / `daily_limit` / `plan_type` / `daily_used`
3. `accountStorage.convertToDisplayData()` 将 `AccountInfo` 转为 `DisplaySiteData.subscription: SubscriptionInfo`
4. `popup/index.tsx` 从所有账号里选择“最早到期”的订阅用于 BalanceSection 展示

## 时间单位
- `expire_time` 以秒时间戳为主；展示层对毫秒级数值做归一化（> 10_000_000_000 视为毫秒）。

## 站点营收统计
- `SiteAccount.revenue_enabled` 控制是否统计该站点全站营收；添加或编辑时通过 `/api/user/self` 检测管理员角色（`role >= 10`）后才允许开启，普通用户不可保存开启配置。
- One API 系列适配器通过 `/api/log/stat?type=2&start_timestamp=...&end_timestamp=...` 获取当天全站扣费聚合，包含 admin 自己；原始 quota 转换为 USD/CNY 后写入独立 `RevenueSnapshot`，不改变个人余额与今日消耗。
- 营收折算比例 `revenue_exchange_rate` 独立于充值比例，默认 7.2 CNY/USD；按站点 origin 去重，多个账号只汇总最新快照。跨日或失败快照不会冒充今日收入。
- 添加和编辑使用 `AccountManager` 校验营收配置；`AccountManager.refreshAccount()` 与 `accountStorage.refreshAccount()` 都会刷新营收快照，营收接口失败时保留错误状态并继续更新个人数据。
