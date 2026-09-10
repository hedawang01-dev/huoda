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
- @playwright/test 1.55.0，Apache-2.0，浏览器验收依赖。

版本由 package-lock.json 锁定；最终 zip 不包含 node_modules 和浏览器。重装依赖时保留各包许可证。使用系统字体，不分发商业字体文件。本文件不为用户已有活搭代码新增开源许可。

技术文档：

- https://supabase.com/docs/guides/database/extensions/postgis
- https://supabase.com/docs/guides/storage/security/access-control
- https://github.com/supabase/supabase-js
