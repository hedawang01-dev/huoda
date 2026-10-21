# OpenAI 申请条件与非商业许可影响

> 当前仓库更新已获维护者授权，基于 94754e1 保留原历史和 CLI 迁移改进；下文关于无历史交付包及仅本地操作的记录保留为此前准备阶段证据。最新范围见 [私有仓库更新记录](PRIVATE_REPOSITORY_UPDATE.md)。

更新日期：2026-10-21。本文保留真实项目材料和中英介绍，**当前不作为已满足开源资格的申请材料提交**。本次没有提交任何表单。

## 当前许可决定
用户已选择允许公开源码，但限制他人商用。项目自有部分采用 PolyForm Noncommercial 1.0.0，第三方保留各自许可。
这属于非商业源码可见，不符合 [OSI 开源定义第 6 条](https://opensource.org/osd)。不能称 MIT 项目、OSI 开源项目或为申请隐瞒非商业限制。
[OpenAI 官方计划说明](https://developers.openai.com/community/codex-for-oss)面向开源维护者；所读官方页面未明确接收这种受限许可，因此能否被受理或获批须由官方确认，不作保证。不能为申请而擅自放开用户要求的非商业限制。

## 官方页面核对
- [计划说明](https://developers.openai.com/community/codex-for-oss)：考虑使用情况、生态价值、维护角色和持续维护。
- [申请表](https://openai.com/form/codex-for-oss/)要求公开个人 GitHub 资料、公开仓库 URL、primary/core maintainer 角色及最多 500 字符资格说明。
- 六个月 ChatGPT Pro（含 Codex）是审核选中后的权益；Codex Security 和 API credits 可能另行评估。没有发现统一 Stars/下载量硬门槛，不能制造影响力或保证通过。
- 需本人阅读并同意 [计划条款](https://learn.chatgpt.com/docs/codex-for-oss-terms)；本文不代表本人接受条款。不要在申请中提交机密。

## 实际项目材料
- 名称：活搭 HUODA，包版本 0.5.4，源码来源关联提交 071de19；交付包自身无 .git。
- 用途：本地兼职/线上任务发现、报名、沟通、商家认证、审核、评价与举报；支付、资金托管、提现未接入。
- 技术：原生 HTML/CSS/JavaScript、统一 Service、Supabase Auth/RPC/RLS、事务名额、Realtime 和私有 Storage 路径。
- 证据：源码、迁移、既有测试、首次配置修复、分发许可回归、第三方声明和本次真实验证。
- 关联仓库：https://github.com/hedawang01-dev/huoda，2026-10-21 经 GitHub 连接核实为私有；连接账号 hedawang01-dev 具有管理员权限，尚无最终公开 URL。账号控制不证明全部素材权利或真实人类维护角色。
- 维护情况：关联历史有基础/权限、消息、导航与生命周期变更；工具身份不能证明真实人类维护者或人数。
- 使用：可运行匿名本地演示，暂无已核实的社区采用、用户、下载、Stars、fork、收入或公网部署记录。测试夹具不是生产成果。
- 未来：完善真实云端验收、权限回归、文档、无障碍与实际使用反馈，不编造上线计划或社区影响。

## 仍缺少或冲突的条件
1. 当前非商业限制与标准开源定义存在实质差异，不能以标准 OSS 项目口径直接提交；需官方明确是否接受此种受限许可，或由用户以后另行改变授权意愿。
2. 自建部分的 AI 生成来源已由维护者说明，见 [AI_PROVENANCE.md](AI_PROVENANCE.md)，第三方原许可保留；邮箱可选，私密漏洞入口需公开后启用。最终公开仍由用户决定。
3. GitHub 账号和仓库管理员权限已核实；仍需要最终公开 URL、本人确认的真实 primary/core maintainer 角色及持续维护证据。
4. 需要可核查的使用/生态价值与持续维护材料，目前没有提供，不填写猜测统计。
5. 若单独申请 API credits，需实际用途、成本依据与本人 Organization ID；当前应用没有 OpenAI API 集成。
6. 真实 Supabase/PostGIS/Auth/Storage/Realtime/Edge Function、公网及实体设备验收另需完成；本地 PGlite 和模拟传输不能冒充线上通过。

## 中文真实介绍草稿
活搭 HUODA 是面向本地兼职和线上任务协作的响应式 Web 项目，包含搜索、报名状态、沟通、商家认证、审核、评价和举报，采用原生 JavaScript 与 Supabase RPC/RLS。0.5.4 源码包含匿名本地演示和自动化测试。用户选择 PolyForm Noncommercial 1.0.0，因此它是非商业源码可见项目，不是 OSI 标准开源项目。目前没有已核实的社区采用数据。自建内容的 AI 辅助生成来源已由维护者说明；公开发布、本人维护角色与采用证据仍需补充；不能以本草稿声称满足 Codex for Open Source 条件。

## English factual introduction draft
HUODA is a responsive web project for local part-time work and online task collaboration. It provides task discovery, application workflows, messaging, merchant verification, moderation, reviews, and reports using vanilla JavaScript and Supabase RPC/RLS. Version 0.5.4 includes an anonymous local demo and automated tests. The owner selected PolyForm Noncommercial 1.0.0. It is therefore noncommercial source-available software, not OSI open source. Community adoption has not been verified. The maintainer has stated that the project-created code and materials were produced with AI assistance; third-party licenses remain applicable. Public release, the human maintenance role, and adoption evidence still need confirmation. Acceptance under Codex for Open Source has not been established.

## 如需向官方说明的短草稿
HUODA is a task collaboration web project using vanilla JavaScript and Supabase RPC/RLS. It includes moderation, messaging, and regression tests. Its own code is licensed under PolyForm Noncommercial 1.0.0, so it is source-available, not OSI open source. Community adoption and maintainer identity remain unverified. We have not established eligibility for this program.

这份短草稿不隐瞒许可限制，不作为已经达标的正式申请；所有对外申请均由本人另行决定。
