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

## Claude Code Hub
- 类型探测：`GET /api/actions/openapi.json` 的标题为 `Claude Code Hub API`，并声明 `POST /api/actions/my-usage/getMyQuota`；已对照 cc2.caaa.tech 的 v0.8.10 部署。
- 自动识别与刷新使用浏览器 Cookie，不提取或保存登录 Token。跨站 Cookie 不可用时，后台在同源页面调用固定的只读配额 Action；后台自动刷新直接调用处理器，避免向自身发送消息。
- 配额 Action 返回 403 时，以同源登录态 GET `/zh-CN/dashboard/my-quota`，用 DOMParser 读取“总额度”卡片的“用户”进度标签及页头用户名；不执行页面脚本，不修改权限。此回退采用页面显示的两位小数精度；登录页、无限额度或无法匹配的页面结构均报错。
- 余额使用用户级 `userLimitTotalUsd - userCurrentTotalUsd`，不使用密钥额度。人民币展示复用账号 `exchange_rate`（充值金额比例），只乘一次；倍率由用户填写。
- 今日消耗读取用户级 `userCurrentDailyUsd`（遵循站点日额度重置规则）；403 页面回退读取“日额度”卡片的用户已用金额，包含日额度不限的情况。人民币消耗复用充值比例；不提供 Token/请求数统计或密钥管理。
- 总额度无限/未设置、字段异常或登录用户名发生变化时提示错误，不将其当成零余额。新增和编辑账号的充值比例输入步长为 0.01，最小值 0.01。
- 验证：`node --test tests/claude-code-hub.test.cjs`，覆盖识别、Cookie 回退、用户级余额、保存及两个刷新入口、倍率换算与异常数据。

## Sub2API
- 鉴权：用户面板 JWT（Bearer `auth_token`）
- 续期：两个账号刷新入口共用 `fetchAccountSnapshot`，只在 401 时经后台在站点 MAIN world 恢复凭据；后台自身调用直接处理，扩展页面通过消息调用。同源使用官方 `sub2api-auth-token-refresh` Web Lock 协调轮换。优先采用网页新 Token，否则 POST `/api/v1/auth/refresh`；按官方顺序更新站点 `auth_token` / `token_expires_at` / `refresh_token`，扩展仅保存经过用户资料接口校验的访问 Token，随后重试一次。
- 身份保护：新保存账号记录服务端用户 ID；旧账号可从原 JWT 的 `user_id` 恢复预期身份。浏览器账号不符、跳转跨源或续期期间切换账号均拒绝更新扩展凭据。凭据在重试查询前持久化，避免用量失败丢失新 Token。
- 验证：`node --test tests/sub2api-session.test.cjs`；官方依据为 Wei-Shaw/sub2api `772a0382` 的 `frontend/src/api/tokenRefresh.ts`。旧版/定制站点的刷新协议及跨标签页协调需实际验证。
- 余额：`GET /api/v1/user/profile` → `data.balance`（USD）
- 自动识别：从已登录页面的 localStorage 读取 `auth_user` / `auth_token`，并用用户资料接口校验。
- 类型探测：`/api/v1/settings/public` 返回 `code: 0`，且 `site_name`、`version`、`server_timezone` 为字符串；不要求可选的 `available_channels_enabled`，兼容 RouteX 等定制版。
- 今日用量：`GET /api/v1/usage/dashboard/stats` → `data.today_actual_cost` / `today_input_tokens` / `today_output_tokens` / `today_requests`。
- 定制站统计兼容：仅当上述接口返回 HTTP 404 时，回退到 `GET /api/v1/usage/stats?period=today`，映射 `total_actual_cost` / `total_input_tokens` / `total_output_tokens` / `total_requests`；其他错误及回退失败继续上报，不以零用量掩盖故障。
- Key 管理：`/api/v1/keys`（GET 列表、POST 创建）及 `/api/v1/keys/:id`（GET 详情、PUT 编辑、DELETE 删除）；分页从 1 开始，默认列表加载全部页。分组来自 `/api/v1/groups/available`；今日用量通过 POST `/api/v1/usage/dashboard/api-keys-usage` 按 ID 批量查询。
- Key 字段：`quota` 是美元总上限，0 表示无限，`quota_used` 是已用金额。映射到通用列表时附带 `quota_conversion_factor: 1`；Sub2API Key 复制时保留原值。创建有效期使用正整数 `expires_in_days`，编辑使用 RFC3339 `expires_at`，空字符串清除到期时间；未编辑的到期时间、状态与分组不发送。
- 管理页面和复制弹窗通过 `services/tokenManagement.ts` 获取最新存储凭据，复用 `withCredentialRecovery`；写操作仅在明确 401 时重试一次，网络/5xx 错误不重复写入。Sub2API 使用独立配置表单，模型范围由分组决定。
- Key 回归验证：`node --test tests/sub2api-keys.test.cjs tests/sub2api-session.test.cjs`，覆盖原 OneAPI 路由、美元额度、分页、CRUD、凭据持久化、编辑字段保留及不重复写入。
