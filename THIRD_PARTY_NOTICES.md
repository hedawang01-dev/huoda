# 第三方声明

2026-09-10 阅读以下项目说明，参考架构/流程。没有直接移植其代码、UI、Logo、图片、商业字体或截图：

| 项目 | 参考内容 |
|---|---|
| https://github.com/Chainucha/dailywork | 游客、PostGIS、报名、评价、通知 |
| https://github.com/freelancezero/freelancezero | 服务分层、管理员隔离、审计 |
| https://github.com/mikias-tulu/getJOBS-freelance-app | 技能任务和档案流程 |
| https://github.com/SudoPengu/job-pair | 仅阅读项目说明，不复制代码素材，不据此认定许可 |

无直接移植代码段，因而没有需登记的原文件片段。

## 实际分发依赖

- @supabase/supabase-js 2.57.4，MIT，Copyright (c) 2020 Supabase。原样复制官方 npm 包 dist/umd/supabase.js 为 vendor/supabase-2.57.4.js。完整许可证见 vendor/SUPABASE-LICENSE.txt；打包依赖许可证见 vendor/DEPENDENCY_LICENSES.txt。
- @electric-sql/pglite 0.3.14，Apache-2.0，开发测试依赖。
- @playwright/test 1.55.1，Apache-2.0，浏览器验收依赖。

版本由 package-lock.json 锁定；最终 zip 不包含 node_modules 和浏览器。重装依赖时保留各包许可证。使用系统字体，不分发商业字体文件。本文件不为用户已有活搭代码新增开源许可。

技术文档：

- https://supabase.com/docs/guides/database/extensions/postgis
- https://supabase.com/docs/guides/storage/security/access-control
- https://github.com/supabase/supabase-js

## 2026-10-21 授权复核

以上参考来源声明保留原始日期。本次未发现独立分发的图片、音视频或字体；新增截图来自匿名本地演示的实际浏览器测试。
已安装依赖清单显示 MIT、Apache-2.0、BSD-2-Clause 等许可。第三方原许可继续适用，完整许可文件必须保留。项目自有且有权授权的部分已按根 LICENSE 采用 PolyForm Noncommercial 1.0.0；维护者已说明自建代码与素材由 AI 辅助生成，服务条款和可核验来源范围见 docs/AI_PROVENANCE.md。第三方原许可独立保留，不能用项目非商业条款取消第三方本已授予的商用权。

## 锁定依赖与许可正文复核（2026-10-21）

逐项版本、安装状态、许可文件与 SHA-256 见 [完整清单](docs/THIRD_PARTY_INVENTORY.json)。本版保留原 main 的 Supabase CLI 2.117.0；锁文件含 35 个依赖条目，本机实际安装 27 个。其余为其他平台的 CLI 或 macOS fsevents 可选包，Windows 未安装属正常情况。

已验证 vendor/supabase-2.57.4.js 与锁定 npm 包的 UMD 文件逐字节一致；SUPABASE-LICENSE 与 DEPENDENCY_LICENSES 的 10 段正文已逐项比对（允许换行差异）。

上游 @supabase/storage-js 2.12.1 的 package/lock 元数据标注 MIT，但随包 LICENSE 实际为 Apache-2.0；DEPENDENCY_LICENSES 已保留其完整 Apache 正文。本项目如实登记该差异，不改写上游原文，不把元数据标注视为替代许可正文。tr46 0.0.3 元数据标注 MIT，安装目录未附独立 LICENSE/NOTICE；本源码包不分发 node_modules 或独立 tr46 副本，不虚构缺失的许可文件。后续若改变依赖或分发方式，应重新复核。

## AI 生成来源补充

维护者于 2026-10-21 提供的 AI 生成说明仅覆盖其描述的项目自建部分，不把本文件列出的依赖、vendor 或原许可算作 AI 原创。代码生成也可能涉及第三方许可；当前来源核验没有替代逐行全球相似性鉴定或商标查新，也不以“AI生成”主张第三方版权转归维护者。
