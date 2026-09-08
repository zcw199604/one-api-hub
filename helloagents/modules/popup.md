# popup

## BalanceSection 标签页
- 当存在 `subscription` 时渲染第 3 个 Tab（订阅信息）。
- `selectedIndex` 由 `activeTab` 与是否存在订阅共同决定，避免越界。
- 当存在订阅账号时，「今日消耗」面板按“订阅套餐/按量付费”拆分展示。
