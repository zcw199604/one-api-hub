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
- BalanceSection 标签页状态使用 `BalanceTab`：`consumption` / `balance` / `subscription`
  - `subscription` 仅在存在订阅信息时渲染
