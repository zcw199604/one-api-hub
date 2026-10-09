# preferences

## 职责
- 通过 `@plasmohq/storage` 持久化用户偏好

## BalanceTab
- `activeTab` 支持：`consumption` / `balance` / `revenue` / `subscription`
- `revenue` 仅在存在已启用且成功读取营收快照的站点时显示；`subscription` 仅在存在订阅信息时显示。
- 当当前数据不支持偏好值时，UI 会自动回退到 `balance`。
