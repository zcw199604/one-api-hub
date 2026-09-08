# adapters

## 职责
- 统一各站点的鉴权、余额、用量与状态探测

## Right.codes 订阅字段
- Right.codes 适配器在 `getAccountBalance()` 的返回 `extra` 中附带订阅相关字段（如 `expire_time` / `daily_limit`）。
- 上层服务（AccountManager）在保存/更新/刷新时将这些字段写入 `AccountInfo`，供展示层使用。
- Right.codes 订阅数据来源：`GET /subscriptions/list`。

## Portunex
- 鉴权：Bearer Token（session token）
- 余额：`GET https://api.portunex.gewulabs.group/portunex/users/me` → `points`
- 今日用量：`GET https://api.portunex.gewulabs.group/portunex/users/me/stats` → `total_points_consumed` / `total_input_tokens` / `total_output_tokens` / `total_requests`

## Sub2API
- 鉴权：用户面板 JWT（Bearer `auth_token`）
- 续期：两个账号刷新入口共用 `fetchAccountSnapshot`，只在 401 时经后台在站点 MAIN world 恢复凭据；后台自身调用直接处理，扩展页面通过消息调用。同源使用官方 `sub2api-auth-token-refresh` Web Lock 协调轮换。优先采用网页新 Token，否则 POST `/api/v1/auth/refresh`；按官方顺序更新站点 `auth_token` / `token_expires_at` / `refresh_token`，扩展仅保存经过用户资料接口校验的访问 Token，随后重试一次。
- 身份保护：新保存账号记录服务端用户 ID；旧账号可从原 JWT 的 `user_id` 恢复预期身份。浏览器账号不符、跳转跨源或续期期间切换账号均拒绝更新扩展凭据。凭据在重试查询前持久化，避免用量失败丢失新 Token。
- 验证：`node --test tests/sub2api-session.test.cjs`；官方依据为 Wei-Shaw/sub2api `772a0382` 的 `frontend/src/api/tokenRefresh.ts`。旧版/定制站点的刷新协议及跨标签页协调需实际验证。
- 余额：`GET /api/v1/user/profile` → `data.balance`（USD）
- 自动识别：从已登录页面的 localStorage 读取 `auth_user` / `auth_token`，并用用户资料接口校验。
- 今日用量：`GET /api/v1/usage/dashboard/stats` → `data.today_actual_cost` / `today_input_tokens` / `today_output_tokens` / `today_requests`。
- Key 管理：`/api/v1/keys`（GET 列表、POST 创建）及 `/api/v1/keys/:id`（GET 详情、PUT 编辑、DELETE 删除）；分页从 1 开始，默认列表加载全部页。分组来自 `/api/v1/groups/available`；今日用量通过 POST `/api/v1/usage/dashboard/api-keys-usage` 按 ID 批量查询。
- Key 字段：`quota` 是美元总上限，0 表示无限，`quota_used` 是已用金额。映射到通用列表时附带 `quota_conversion_factor: 1`；Sub2API Key 复制时保留原值。创建有效期使用正整数 `expires_in_days`，编辑使用 RFC3339 `expires_at`，空字符串清除到期时间；未编辑的到期时间、状态与分组不发送。
- 管理页面和复制弹窗通过 `services/tokenManagement.ts` 获取最新存储凭据，复用 `withCredentialRecovery`；写操作仅在明确 401 时重试一次，网络/5xx 错误不重复写入。Sub2API 使用独立配置表单，模型范围由分组决定。
- Key 回归验证：`node --test tests/sub2api-keys.test.cjs tests/sub2api-session.test.cjs`，覆盖原 OneAPI 路由、美元额度、分页、CRUD、凭据持久化、编辑字段保留及不重复写入。
