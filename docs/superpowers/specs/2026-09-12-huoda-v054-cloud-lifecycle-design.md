# 活搭 HUODA 5.4 云端化与真实业务闭环设计

状态：用户已在 2026-09-11 的需求中批准 Supabase + GitHub + Vercel 方向，并明确要求继续完成本地升级，不因尚未创建云项目而暂停。

## 方案比较

### 方案 A：保留现有栈，增量扩展数据库与 Service（采用）

保留单页原生 HTML/CSS/JS、Hash 路由和响应式布局；增加一份 006 增量迁移，把状态变更收口到 RPC，并逐步把 `app.js/pages` 的数据访问移入 Service。优点是视觉回归风险最低、已有 65 项测试可直接复用、以后仍能替换后端；代价是 `app.js` 的页面模板不会在本次彻底模块化。

### 方案 B：保留 UI，但重写前端状态管理

引入模块打包器和新的 store，把页面、状态、Service 全部模块化。结构会更整洁，但迁移面大，可能破坏当前脚本加载顺序、内联事件、Hash 路由和六档响应式布局，不适合本次“先形成真实业务闭环”的目标。

### 方案 C：改成 React/Vue 全量重做

不采用。它需要重建每个页面和交互，既没有解决数据库状态机本身，又与用户要求保持现有技术栈和视觉效果相冲突。

## 架构

```text
现有页面与路由
  -> H.services.auth/account/task/application/favorite/message/notification/review/report/merchant
      -> 本地演示适配（localStorage，仅开发/本地验收）
      -> Supabase 适配（Auth + RPC + RLS + Realtime + Storage）
          -> PostgreSQL 状态机与审计
          -> Edge Function 管理审核
```

页面只表达用户动作和渲染结果。Service 负责会话保护、请求序列、防止旧账号响应回写、输入校验和本地/云端两种适配。数据库负责权限、状态转换、并发名额、审计和通知。PC 与手机仍加载完全相同的 Service 和数据库契约。

## 业务生命周期

任务创建可选择保存草稿或提交审核。草稿仅商家可见；提交后进入审核中；管理员批准后招聘中；录用达到名额后自动已招满；商家可结束招聘；管理员可下架。修改招聘核心信息后重新进入审核中。已招满任务因已录用者取消且仍在有效期内可恢复招聘中，结束和下架不能由普通页面任意恢复。

报名从已报名开始。商家打开报名详情时可标记已查看；商家可进入沟通中并开始聊天；随后录用或不录用。求职者可在录用前取消，录用后取消会归还名额并记录审计。已录用双方可确认完成，完成后双方各评价一次。为兼容 5.3，商家仍可从已报名直接录用，但 UI 引导先查看、再沟通。

游客只可浏览、搜索和查看公开信用资料。收藏、报名、聊天、发布、评价和举报均调用统一登录门卫；成功登录后继续原动作。5.3 产生的游客收藏不再自动并入账户，避免跨身份归属不明。

## 数据与兼容

006 迁移只做增量变更：先放宽旧约束、映射旧值、再建立新约束和 RPC。原 001–005 不修改，以便已部署环境按顺序升级。旧 `open` 映射为 `recruiting`，满员的 `closed` 映射为 `full`，手动关闭/暂停映射为 `ended`，`completed` 映射为 `ended`。原 review_status 保留用于历史兼容和审核记录，但新任务主状态直接表示草稿/审核/招聘阶段。

账户私有数据由 accountService 一次加载并在会话令牌仍有效时提交到 state。Auth 由 authService 统一提供 `init/signUp/signIn/signOut`。通知、举报、任务修改、收藏和消息不再由页面直接调用 `sb.from/sb.rpc/localDb`。

## 配置与部署

仓库保留 `config.example.js`，忽略真实 `config.js` 和全部本地密钥文件。`npm run build` 只复制运行所需的 allowlist 文件到 `dist`，并从 `HUODA_SUPABASE_URL`、`HUODA_SUPABASE_PUBLISHABLE_KEY` 生成公开前端配置。生产构建缺任一项就失败；`HUODA_ALLOW_LOCAL_DEMO=1` 只允许本机预览构建。

Vercel 使用 `npm run build` 和 `dist` 输出，配置 `/admin` 到 `/admin/index.html`，Hash 路由无需服务端 SPA 回退。构建检查会验证文件大小写、资源引用、秘密模式、禁止发布的 SQL/tests/.env/服务端函数，以及 `config.js` 只含允许公开字段。

## 错误与安全

所有受保护动作先执行登录门卫。数据库 RPC 返回稳定错误码，页面使用中文映射；网络失败保留当前内容和草稿。生产缺配置直接停止构建，部分配置在运行时显示阻断页，不静默切换到 localStorage。

前端仅使用 Supabase publishable/anon key。表级 RLS 和安全定义 RPC均固定 `search_path`、撤销匿名/公开执行后按需授予。管理员仍通过独立 Auth 存储和 Edge Function 校验 `admin_users`；Service Role 不由用户输入，也不写入 Git/Vercel 静态构建。

## 验证

保留 5.3 的语法、浏览器、六档响应式、消息、草稿、账号切换和数据库权限测试；更新游客收藏断言为登录门卫。新增任务六状态、报名七状态、聊天沟通权限、名额并发、Service 边界、生产构建 allowlist、缺配置失败、资源大小写和 Vercel 路由测试。

没有真实项目时，验证结论限定为本地浏览器、PGlite PostgreSQL 内核和模拟 Supabase SDK。创建真实 Supabase 后再执行 Auth 邮件、PostGIS、Realtime、Storage、手机/电脑双设备和 Vercel 公网验收。

