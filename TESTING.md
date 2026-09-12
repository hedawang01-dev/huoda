# 活搭 HUODA 5.4 测试与上线验收

## 本地自动化

先启动本地服务：

    npm start

在另一个终端运行：

    npm run check
    npm test
    npm run build:demo
    npm run verify:dist
    npm audit

浏览器测试覆盖 375×812、430×932、768×1024、1366×768、1440×900、1920×1080。BROWSER_PATH 可指向 Chrome/Chromium；GitHub Actions 会安装 Playwright Chromium。

## 自动化覆盖

| 测试 | 内容 | 边界 |
|---|---|---|
| database.test.cjs | 5.3 基线 SQL/RLS/RPC 与旧迁移兼容 | PGlite PostgreSQL；空间函数替身 |
| database-v054.test.cjs | 006 六态任务、七态报名、草稿审核、沟通、名额、结束/下架、评价、举报 | 真实 PL/pgSQL/RLS 执行；不是线上 Supabase |
| v054-browser.test.cjs | 游客登录门槛、草稿→审核、完整报名链、沟通聊天、六档无溢出 | 本地演示浏览器 |
| cross-device-browser.test.cjs | 两个独立 BrowserContext 共用 SQL/RLS，收藏、报名、消息、发布、资料、评价和审核同步 | Auth/PostgREST/Realtime 传输为测试适配器 |
| deploy-v054.test.cjs | 生产配置拒绝、公开文件 allowlist、路径大小写、后台资源、Vercel 输出和高权限 key 拦截 | 本地构建合同 |
| service/sync/version-review | 账号切换、迟到响应、写锁、消息分页、权限和断网恢复 | 回归与并发顺序 |
| moderation/responsive/browser | 审核后台、完整本地业务、PC/手机布局和截图 | 演示数据，不代表真实商家 |
| live-concurrency.cjs | 两个真实 HTTP 请求抢最后名额 | 需隔离 Supabase，当前未执行 |

## 逐表/RPC 权限门槛

| 数据 | 正向 | 必须拒绝 |
|---|---|---|
| profiles / worker_profiles | 本人读取并经 save_my_profile 更新 | 读取私密企业字段、替别人修改、自认证 |
| merchant_profiles | 本人提交 pending 认证 | 普通用户写 verified、读取他人信用代码/执照路径 |
| tasks | 游客只看 approved + recruiting + 有名额 + 未过期；所有者看自己的全部状态 | 未认证提交审核、自审、直接改 owner/名额/审核态 |
| applications | 参与方读取，合法 RPC 七态流转 | 自报名、重复报名、第三方操作、终态回退、超卖 |
| messages | communicating/accepted 双方发送；completed 只读 | 第三方读写、伪造 system/sender/read_at、完成后继续发送 |
| reviews | completed 后双方各一次 | 未完成、非参与者、自评、重复、越界评分 |
| favorites | 登录用户只读写自己的收藏 | 游客收藏、写其它 user_id、读取他人收藏 |
| notifications | 本人读取并经 RPC 标记已读 | 给别人插入、直接篡改内容或已读时间 |
| reports | 登录用户创建并读取自己的处理结果 | 商家读取举报人隐私、普通用户改处理状态 |
| audit_logs / admin_users | 后台受控写入/授权 | 普通用户读取或授予自己管理员 |
| storage.objects | 本人 UUID 目录上传审核材料 | 他人目录、公开读取、覆盖/删除已提交证据 |

## 真实 Supabase + Vercel 必测

### A. 登录与游客

无痕访问可浏览、搜索、详情和公开信用页。收藏、报名、聊天、发布、消息和私有记录先出现登录；登录后刷新会恢复会话，退出后不残留上一账号数据。

### B. 任务生命周期

商家保存 draft，提交后 pending_review 且游客不可见；管理员批准后 recruiting；录满变 full；商家结束变 ended；商家或管理员下架变 taken_down。审核拒绝、结束和下架会把 applied/viewed/communicating 报名关闭为 rejected，并产生通知与审计。

### C. 报名生命周期

在两个账号依次验证 applied → viewed → communicating → accepted → completed，以及 rejected/cancelled。角色错误、非法跳转、重复报名和任务过期都应被数据库拒绝。

### D. 名额并发

创建只剩 1 个名额的任务，两名求职者并发由商家录用，只允许一个成功，spots_left 不得小于 0。已录用者取消后，在任务仍 approved/recruiting 条件下归还名额；ended/taken_down 不得自动重新上架。

### E. 消息与 Realtime

沟通中和已录用双方可发消息；未读/已读跨端同步；completed 只可查看历史。任务、报名、消息和通知的 Realtime 事件应触发 Service 重读；切后台恢复和 15 秒兜底不丢草稿。

### F. 评价、举报和后台

完成后双方各评价一次；举报只对本人和管理员可见。普通账号访问 /admin/、调用后台函数或审核 RPC 必须拒绝；管理员处理后通知和 audit_logs 正确。

### G. Storage

真实 JPG/PNG/PDF 且不超过 10MB 才能上传。第三人下载失败，审核员获得的 signed URL 约 60 秒失效。检查项目中没有其它宽泛 Storage policy 放开私有桶。

### H. 部署与设备

检查 /、/#/detail/任务ID、/#/chat/报名ID、/#/messages、/admin 和 /admin/；直接刷新不丢页面。手机、平板和 PC 无横向溢出。生产 config.js 只有 Project URL 和公开 key，SQL、测试、脚本、.env、源码配置样例不出现在公网 dist。

## 验收边界

真实 Supabase 已完成基础迁移与 001–006、Storage 桶和 Edge Function 部署，且已验证游客搜索 RPC 与匿名 RLS 拒绝。Auth 邮件、双账号 WebSocket Realtime、真实执照上传、后台完整处理、跨连接并发和 Vercel 公网设备验收仍待执行；本地 PGlite 与模拟 SDK 结果不能替代这些剩余场景。
