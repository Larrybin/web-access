# TODOS

## Infrastructure

### Gate Chrome Extension Packaging Behind Stable Runbooks

**What:** 只有当至少 3 个真实站点的 runbook 打通且结构稳定后，才评估是否增加 Chrome 插件壳。

**Why:** 现在先做插件会把错误抽象和不稳定流程提前固化，拖慢第一版最关键的单站点执行闭环。

**Context:** 当前批准的方案明确把 Chrome 插件形态列为 out of scope。第一版目标是基于现有 `web-access` skill，跑通 `攻略页 -> 目标站 -> 成功提交一条外链`，并沉淀稳定的 runbook 结构。等至少 3 个站点成功样本出现后，再判断插件化是否真有必要，以及哪些交互值得提升为 UI。

**Effort:** M
**Priority:** P2
**Depends on:** 至少 3 个真实站点 runbook 成功样本，且 runbook 字段结构基本稳定

### Define Promotion Rules From Runbook To Site Pattern

**What:** 定义一次执行生成的 runbook 在什么条件下才允许升级为仓库内 `references/site-patterns/` 的长期站点经验。

**Why:** 防止把一次性、偶发性、未验证的观察结果误写成长期经验，污染这个仓库最重要的复用资产。

**Context:** 当前方案已经明确区分“生成型 runbook”和“稳定站点经验”，但还没有写清楚升级门槛。至少应当要求重复验证或明确可复现证据，避免把单次执行中的偶然状态、临时 UI、异常登录态直接固化进 `site-patterns`。

**Effort:** S
**Priority:** P2
**Depends on:** 至少 2 次同站点执行验证，或一次执行加明确可复现证据

## Completed
