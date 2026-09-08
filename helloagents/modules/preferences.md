# preferences

## 职责
- 通过 `@plasmohq/storage` 持久化用户偏好

## BalanceTab
- `activeTab` 支持：`consumption` / `balance` / `subscription`
- 当当前没有订阅数据但偏好值为 `subscription` 时，UI 会自动回退到 `balance`。
