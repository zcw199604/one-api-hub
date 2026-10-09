# 项目上下文（one-api-hub）

## 项目定位
- 浏览器扩展（Plasmo）
- 聚合管理多站点账号：余额、用量、健康状态等

## 技术栈
- TypeScript + React 18
- Plasmo 0.90.5
- TailwindCSS
- @plasmohq/storage

## 关键目录
- `adapters/`: 站点适配器（余额/用量/状态）
- `services/`: 账号管理、存储、偏好设置等
- `popup/`: 插件弹窗页面
- `components/`: UI 组件
- `types/`: 共享类型

## 关键约定
- 订阅展示使用 `SubscriptionInfo`（到期时间以秒时间戳为主；展示层对毫秒值做归一化）
- BalanceSection 标签页状态使用 `BalanceTab`：`consumption` / `balance` / `revenue` / `subscription`
  - `revenue` 仅在有启用营收统计且可用的站点时渲染
  - `subscription` 仅在存在订阅信息时渲染
- 添加/编辑站点可启用营收统计；保存时必须通过站点管理员权限检测。营收按当天 `/api/log/stat?type=2` 的全站扣费聚合计算，独立使用营收折算比例，不混入个人余额或消耗。
