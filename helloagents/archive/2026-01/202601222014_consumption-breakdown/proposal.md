# 方案提案：今日消耗按订阅/按量拆分展示

## 背景
当前弹窗顶部「今日消耗」只展示汇总金额，无法区分订阅套餐与按量付费账号的消耗来源。

## 目标
- 在「今日消耗」面板中同时展示：
  - 订阅套餐消耗（subscription accounts）
  - 按量付费消耗（non-subscription accounts）

## 口径
- 分类规则：`DisplaySiteData.subscription` 存在 → 订阅套餐；否则 → 按量付费。
- 统计口径：沿用现有 `todayConsumption`（USD/CNY），只做分组汇总，不改变原始计算方式。

## 实现
- 新增工具函数 `calculateConsumptionBreakdown(displayData)` 计算分组汇总。
- `popup/index.tsx` 计算拆分数据并传入 `BalanceSection`。
- `BalanceSection` 在存在订阅账号时，在汇总金额下方展示两块拆分数据（订阅套餐/按量付费）。

## 验收
- `npx tsc -p tsconfig.json --noEmit` 通过
- UI：存在订阅账号时「今日消耗」面板出现拆分展示
