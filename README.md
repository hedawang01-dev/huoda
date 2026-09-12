# 活搭 HUODA 5.4

活搭 5.4（包版本 0.5.4）在原 5.3 纯 HTML/CSS/JavaScript 项目上增量升级，保留现有品牌、页面结构、顶部搜索、PC/手机响应式布局和消息返回体验。前端没有改成 React 或 Vue。

当前源码已具备本地演示、Supabase 云端数据结构、统一 Service 数据访问、业务状态闭环和 GitHub + Vercel 生产构建。由于尚未创建真实 Supabase、GitHub 仓库和 Vercel 项目，公网与真实跨设备验收仍需按本文步骤完成；本地合同测试不能冒充真实上线。

## 5.4 已完成

- 游客可浏览、搜索和查看兼职；收藏、报名、聊天、发布及私有记录需要先登录。
- 任务支持：draft 草稿、pending_review 审核中、recruiting 招聘中、full 已招满、ended 已结束、taken_down 已下架。
- 报名支持：applied 已报名、viewed 商家已查看、communicating 沟通中、accepted 已录用、rejected 未录用、completed 已完成、cancelled 已取消。
- 商家可保存草稿、提交审核、查看报名、发起沟通、录用/拒绝、结束招聘和下架任务；名额变化由数据库事务处理。
- 任务结束或下架会关闭仍未决的报名；已录用合作可以继续完成和评价。
- 收藏、消息、通知、报名、资料、评价和举报均有 Supabase 数据路径；页面不直接操作数据库，统一经过 src/services。
- Realtime 只触发 Service 重读，任务、报名、消息、通知不会直接信任事件载荷。
- 独立 /admin/ 后台包含商家认证、任务审核和举报处理；管理员身份由 Edge Function 与 admin_users 校验。
- 生产构建只发布精确的 dist 白名单；缺少云端配置会停止构建，不会把公网网站降级成本地演示。
- vercel.json 已处理 /admin 路径、缓存和基础安全响应头；Hash 路由刷新不需要服务端重写。
- config.js、.env、Vercel 元数据、证书和构建产物均已忽略；浏览器构建会拒绝 Secret/Service Role key。
- 支付、资金托管和提现未接入。

初始检查见 docs/V054_项目检查报告.md，最终改动和验收见 docs/V054_升级与验收报告.md。

## 5.3 恢复点

- Git commit：6a95a0a，tag：v5.3-stable
- 文件备份：C:\Users\h'x'c\Desktop\兼职平台开发\备份\v5.3-stable_20260911_223322

如需检查旧版，可运行 git show v5.3-stable。不要在有未保存改动时直接执行会覆盖工作区的 Git 恢复命令。

## 目录结构

    huoda_v050/
    ├─ index.html                 用户端入口
    ├─ app.js                     路由、状态与现有页面模板
    ├─ style.css / responsive.css / status.css
    ├─ config.js                  本机配置，已被 Git 忽略
    ├─ config.example.js          可提交的配置模板
    ├─ admin/                     独立审核入口、页面和 Service
    ├─ src/core/                  Service 注册、同步、启动
    ├─ src/pages/                 消息、档案、响应式与聊天历史
    ├─ src/services/              Auth、任务、报名、收藏、消息等 13 个 Service
    ├─ supabase/migrations/       001–006 增量迁移
    ├─ supabase/functions/        admin-review Edge Function
    ├─ scripts/                   本地服务、检查、构建、dist 校验
    ├─ tests/                     SQL/RLS、浏览器、跨端和部署测试
    ├─ docs/                      检查、设计、迁移和验收文档
    ├─ .github/workflows/quality.yml
    ├─ .gitignore
    ├─ vercel.json
    └─ package.json

## 本地启动

首次在一台新电脑上运行：

    npm ci
    npm start

打开：

- 用户端：http://127.0.0.1:8085/
- 审核后台：http://127.0.0.1:8085/admin/

也可以双击 启动活搭.cmd。本地 config.js 的 Supabase URL/key 为空时是明确标识的 LocalStorage 演示模式，只在当前浏览器保存，不会跨设备。

常用检查：

    npm run check
    npm test
    npm run build:demo
    npm run verify:dist
    npm audit

## 生产构建

生产构建只接受 Supabase 的公开 Project URL 与 publishable/anon key：

    $env:HUODA_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
    $env:HUODA_SUPABASE_PUBLISHABLE_KEY="sb_publishable_YOUR_PUBLIC_KEY"
    npm run build
    npm run verify:dist

生成的 dist/config.js 会包含这两项公开浏览器连接信息。数据库密码、Secret key、Service Role key、管理员密码不得写入源码、config.js、GitHub 或 Vercel。

## 新建 Supabase 项目

1. 打开 https://supabase.com/dashboard，创建项目并自行保管数据库密码。
2. 在 SQL Editor 按 MIGRATION.md 的顺序运行 supabase.sql 和 001–006；生产库不要运行 seed.sql。
3. 在 Project Connect/API Keys 中复制 Project URL 和 publishable key。它们是浏览器公开连接信息，不是数据库密码。
4. 在 Authentication → URL Configuration 中，先填本地地址，Vercel 发布后再加入正式 HTTPS 域名。
5. 注册管理员账号后，只在 SQL Editor 将该账号写入 admin_users；普通前端无权授予管理员。
6. 部署 supabase/functions/admin-review，并把 ADMIN_ALLOWED_ORIGINS 设置为正式 Vercel 域名。Supabase 管理函数端服务变量，不把它复制到前端。

更易读的逐步说明见 docs/云端接入_从这里开始.md。

## 新建 GitHub 仓库并上传

在 GitHub 网页创建一个空仓库，例如 huoda。不要勾选自动创建 README、.gitignore 或 License，因为本地仓库已有这些文件。然后在项目目录执行：

    git remote add origin https://github.com/YOUR_NAME/huoda.git
    git branch -M main
    git push -u origin main --tags

如果已经存在 origin，使用 git remote set-url origin。上传前用 git status 确认 config.js、.env、dist、node_modules 没有进入提交。

## 创建 Vercel 项目并发布

1. 打开 https://vercel.com/dashboard，选择 Add New → Project，导入刚创建的 GitHub 仓库。
2. Framework Preset 选择 Other。vercel.json 已指定 npm run build 与输出目录 dist。
3. 在 Project Settings → Environment Variables 添加 HUODA_SUPABASE_URL 和 HUODA_SUPABASE_PUBLISHABLE_KEY；城市与默认坐标可选。
4. 不要在 Vercel 添加数据库密码、Secret key 或 Service Role key。
5. 点击 Deploy。发布后检查 /、/#/detail/...、/#/messages 和 /admin/。
6. 把正式域名加入 Supabase Authentication 的 Site URL/Redirect URLs，并将同一 Origin 写入 Edge Function 的 ADMIN_ALLOWED_ORIGINS 后重新部署函数。

## 以后如何自动发布

Vercel 与 GitHub 连接后，每次推送 main 都会自动构建并发布生产版本：

    git add -A
    git commit -m "说明本次修改"
    git push

Pull Request 会生成 Vercel 预览地址；合并到 main 后生成正式部署。GitHub Actions 会运行依赖审计、语法检查、浏览器/数据库测试和演示构建；Vercel 生产构建还会再次检查云端配置和公开文件白名单。

## 上线前仍需真实验收

真实 Supabase/Vercel 建好后，必须在手机和电脑上用同一账号验证：注册登录、收藏同步、报名全状态、双向消息与未读、商家发布和审核、评价、举报、私有执照、后台权限、断网恢复和刷新。当前本地 PGlite 与模拟 SDK 已验证契约，但不等于真实 PostGIS、Auth 邮件、Realtime、Storage、Edge Function 和公网网络已经通过。
