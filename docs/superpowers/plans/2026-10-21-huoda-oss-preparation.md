# 活搭 HUODA 开源准备执行计划（2026-10-21）

> 此文件为首次开源准备阶段的已执行计划。用户随后选择非商业许可；当前授权方向和后续变更以 docs/NONCOMMERCIAL_LICENSE_CHANGE.md、docs/LICENSING.md 及公开准备报告为准。

**目标**：在用户选定的 0.5.4 源码交付包中完成本地规范化、必要修复、可复核验证和申请草稿，保持其他版本与远端不变。

**范围**：原生 HTML/CSS/JavaScript；Supabase JS 2.57.4；Node.js 22；PGlite 与 Playwright。用户完整需求为本次任务的执行规范，不新增产品功能或改动业务规则。

## 约束
- 选定目录不含 .git，不初始化仓库；相邻仓库只用于历史与来源证据。
- 不推送、不发布、不提交申请、不访问或修改生产数据库。
- 保留全部原文件于本地忽略目录 .local/oss-preparation/originals，并记录 SHA-256。
- 不确认项目版权主体，不添加虚构的 MIT 版权署名。
- 真实密钥不进入终端、报告、提交或交付物。
- 保留界面、业务状态规则和技术架构；只修复可证实的低风险问题。

## 阶段与验收
1. [x] 读取需求并定位用户指定源码包；比对关联提交 071de19，记录无自带历史边界。
2. [x] 原文件备份和哈希；静态扫描源码、第三方材料、关联 Git 全历史。
3. [x] 完善 README、CONTRIBUTING、SECURITY、CHANGELOG、授权待确认说明、配置模板、Issue/PR 模板与现有 CI；去除当前文档个人绝对路径。
4. [x] 干净 npm ci；实际执行语法检查、测试、演示构建、产物校验、依赖审计；所有云端测试只使用既有本地测试适配器。
5. [x] 首次 /config.js 缺失问题先增加 HTTP 行为回归并观察失败，再最小修复；已有配置不得覆盖。修复后运行完整回归。
6. [x] 根据 OpenAI 官方页面与表单整理中英申请草稿；公开仓库、维护者、采用情况未知部分如实标明，准备不等于获批。
7. [x] 独立复核修改；生成 A–H 最终报告，区分通过、失败、跳过与未验证。生成无缓存/私人配置的源码交付副本并校验哈希。

## 文件责任
- scripts/serve.cjs、tests/first-run.test.cjs：首次本地配置的资源响应与不覆盖行为。
- README.md、TESTING.md、CONTRIBUTING.md、SECURITY.md、CHANGELOG.md：使用与维护说明。
- docs/LICENSING.md、THIRD_PARTY_NOTICES.md：技术授权检查与待确认权利。
- .env.example、.gitignore、package.json、package-lock.json、.nvmrc、.github/：环境、忽略规则及协作配置。
- docs/CODEX_OSS_APPLICATION.md：官方条件、证据与真实中英草稿。
- OPEN_SOURCE_READINESS_REPORT.md：本次证据、结果、限制及公开阻断项。
