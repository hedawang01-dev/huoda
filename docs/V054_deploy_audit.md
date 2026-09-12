# HUODA v0.5.4 生产部署与安全审计（阶段一）

> 本文保留实施前的审计快照，其中 NO-GO 指当时的 5.3 基线。列出的本地代码阻断项已在 5.4 修复；当前状态以 `V054_升级与验收报告.md` 为准。真实 Supabase/Vercel 尚未创建，因此公网放行仍需真实验收。

审计日期：2026-09-12

审计对象：`C:/Users/h'x'c/Desktop/兼职平台开发/huoda_v050`

基线：`v5.3-stable`，commit `6a95a0a0fda1d341b2555e11e82f1bdfeaea8436`
范围：只读检查与部署规划；本文件是本审计线程唯一写入。未修改业务代码，未创建或修改 GitHub、Vercel、Supabase 外部项目，未执行部署。

审计冻结点是不可变的 `v5.3-stable` / `6a95a0a`。开始取证时工作区为 clean；报告写入后，共享工作区出现了另一来源的并发未提交改动，包括 build、Vercel、Actions 和业务文件。这些并发改动不是本审计创建的，也不属于本报告的已验证基线；阶段二开始前必须另行审查，不能依据本报告自动放行。

## 1. 放行结论

**当前结论：NO-GO，不可直接把仓库根目录发布到生产。**

基线业务代码已经具备“云配置填了一半或云连接失败时不降级到本地数据”的保护，但“配置完全缺失”仍被定义为本地演示模式。基线的 `config.js` 又被 `.gitignore` 排除，提交内没有生产构建、环境注入、`dist`、`vercel.json` 或 GitHub Actions。因此按该基线直接连接 GitHub 与 Vercel，会同时产生两类部署阻断：

1. Vercel 的 `Other` 框架在没有 `public` 目录时默认从项目根目录提供文件。基线根目录包含 SQL、migration、测试、脚本、文档和配置样例，存在源文件公开访问风险。
2. Git 部署不会取得被忽略的 `config.js`。浏览器加载不到配置时，`app.js` 和 `admin/admin.js` 都会进入 LocalStorage 演示模式，不满足“生产缺失云配置必须 fail closed”。

阶段二应先完成静态 `dist` allowlist 构建、公开环境变量注入、Vercel 输出目录与安全头、CI 门禁，再建立预览部署。完成真实 Supabase、Edge Function 和公网设备验收前，不能声称生产可用或跨设备互通。

## 2. 审计发现与优先级

| ID | 等级 | 发现 | 证据与影响 | 阶段二验收条件 |
|---|---|---|---|---|
| D-01 | P0 / 阻断 | 没有静态发布边界 | 无 `dist/`、构建脚本、`vercel.json`、`.vercelignore`；Vercel `Other` 无 `public` 时使用项目根目录 | 构建只复制第 5 节的显式 allowlist；Vercel `outputDirectory=dist`；对禁用路径做公网 404 探测 |
| D-02 | P0 / 阻断 | 生产配置完全缺失时会进入本地 mock | `config.js` 被忽略且当前 URL/key 都为空；`app.js:7` 在未请求云端时直接返回，`app.js:132` 读取本地库；后台也在两项均空时读取本地审核队列 | 构建缺少 URL 或 publishable key 必须非零退出且不得生成 `dist`；产物内必须存在生成的 `config.js`；生产空配置浏览器测试必须显示不可连接且 LocalStorage 业务库保持为空 |
| D-03 | P0 / 阻断 | 没有 GitHub Actions 和产物门禁 | `.github/` 不存在；没有自动检查依赖、语法、测试、产物清单和秘密模式 | PR/push CI 使用锁文件安装、语法检查、测试、生产依赖审计、构建及精确产物清单校验 |
| D-04 | P1 / 合并前修复 | 开发依赖 Playwright 1.55.0 命中高危公告 | `npm audit`：`playwright <1.55.1`，GHSA-7mvr-c777-76hp；风险发生在下载/重装浏览器脚本，不在浏览器生产包 | 升级 `@playwright/test` 至至少 1.55.1，更新锁文件，重新跑完整测试；建议选择当前兼容稳定版 |
| D-05 | P1 / 合并前修复 | `.gitignore` 只忽略 `.env`，未覆盖常见环境文件和 Vercel 本地元数据 | `.env.local`、`.env.production`、`.vercel/`、`dist/` 当前没有规则 | 使用 `.env*` + `!.env.example`，并忽略 `.vercel/`、`dist/`；加入 CI 检查 |
| D-06 | P1 / 部署前修复 | 本地 server 白名单不会约束 Vercel | `scripts/serve.cjs` 仅在 `npm start` 时生效；Vercel 静态部署不会执行它 | 以 `dist` 文件集合本身作为 allowlist，Vercel 只发布 `dist` |
| D-07 | P1 / 部署前修复 | 生产响应头尚未配置 | 本地 server 只有 `nosniff`、Referrer-Policy、no-store；Vercel 无 headers 配置；当前页面含内联事件属性，严格 CSP 需兼容设计 | 在预览部署验证 CSP、frame-ancestors、Permissions-Policy、缓存策略、`nosniff` 和 Referrer-Policy，不破坏登录、定位、Realtime、后台 |
| D-08 | P1 / 部署前修复 | Admin CORS allowlist 尚未绑定真实生产域名 | Edge Function 读取 `ADMIN_ALLOWED_ORIGINS`，缺失时默认本机地址；目前无生产域名配置证据 | Supabase 端配置精确 HTTPS origin，不用 `*`；允许域、拒绝域和无管理员 JWT 分别验收。CORS 仅是浏览器边界，授权仍以 JWT + `admin_users` 为准 |
| D-09 | P1 / 部署前修复 | 没有 Linux/公网的路径大小写与路由验收 | 当前文件系统是 Windows；源码未发现大小写冲突，HTML 引用和真实文件当前逐项匹配 | CI 在 Linux 构建；逐项请求资源；`/admin` 必须重定向到 `/admin/`，hash 路由刷新不发起服务端重写 |
| D-10 | P2 / 加固 | 本地 server 对 `src` 使用规则型白名单 | `src/(core|services|pages)/[A-Za-z][A-Za-z0-9]*.js` 会自动允许未来新增的匹配文件 | 生产构建使用固定数组，不递归复制整个 `src`；新增运行时文件必须显式评审 |

没有发现可确认的生产密钥泄漏、生产依赖漏洞或文件名大小写冲突。以上结论不替代真实公网和 Supabase 验收。

## 3. Vercel 官方文档核对

本次按 2026-09-12 可见官方文档评估：

- Vercel [Configuring a Build](https://vercel.com/docs/builds/configure-a-build) 明确说明，`Other` 框架在项目没有 `public` 目录时会从项目根目录提供文件。这正是该基线直接部署的源文件暴露原因。
- Vercel [`outputDirectory`](https://vercel.com/docs/project-configuration/vercel-json#outputdirectory) 可把发布输出固定到构建目录。建议显式设为 `dist`，不依赖 Dashboard 中的隐式配置。
- Vercel [Environment variables](https://vercel.com/docs/environment-variables) 说明变量可在 Build Step 读取，且变量变更只对新部署生效。原生 HTML/JS 不会自动获得这些变量，因此必须在构建时生成 `dist/config.js`。
- Vercel [`.vercelignore`](https://vercel.com/docs/deployments/vercel-ignore) 是上传排除清单。它可作为纵深防护，但 denylist 容易漏掉未来新文件，不能代替 `dist` allowlist。
- Vercel [`trailingSlash`](https://vercel.com/docs/project-configuration/vercel-json#trailingslash) 可把 `/admin` 统一跳转到 `/admin/`。当前 `admin/index.html` 使用相对 `admin.js`；保留结尾斜杠可避免相对路径解析到 `/admin.js`。
- Vercel 文档说明 `routes.src` 不区分大小写，而 `rewrites`、`redirects`、`headers` 的 `source` 区分大小写。当前应用不需要 broad rewrite 或 catch-all `routes`；应依赖静态文件和浏览器 hash 路由。

建议的 Vercel 项目设置：

| 项 | 目标值 | 理由 |
|---|---|---|
| Framework Preset | Other | 保持原生 HTML/CSS/JS |
| Install Command | `npm ci --ignore-scripts` | 使用 lockfile，减少安装脚本面；CI/构建需要 Node |
| Build Command | `npm run build` | 生成 allowlist `dist` 和生产 `config.js` |
| Output Directory | `dist` | 从发布面排除仓库源文件 |
| Root Directory | 仓库根目录 | 构建脚本和 lockfile 都在根目录 |
| Node | 固定受支持 LTS 主版本 | 避免构建环境漂移；与 CI 一致 |
| Production env | `HUODA_SUPABASE_URL`、`HUODA_SUPABASE_PUBLISHABLE_KEY` | 两项都是浏览器公开连接信息；仅在构建阶段读入 |
| Preview env | 独立测试 Supabase 的 URL/publishable key | 预览不能误连生产数据；仍需完整 RLS |
| Server secret | 不在 Vercel 静态项目配置 | Supabase secret/service-role 只留在 Supabase Edge Function 环境 |
| URL policy | `trailingSlash: true` | 保证 `/admin/` 相对资源路径稳定 |

## 4. 配置、秘密和 fail-closed 审计

### 4.1 当前配置状态

| 位置 | 状态 | 生产判断 |
|---|---|---|
| `config.js:4-5` | URL 与 key 均为空；文件未跟踪、被 `.gitignore` 排除 | 本地开发合理；不能直接用于 Git/Vercel 生产 |
| `config.example.js:3-4` | URL 与 key 均为空 | 样例合理；不得作为生产产物原样复制 |
| `app.js:2-20` | 任一配置存在时请求云；仅一项存在会抛错；SDK 加载失败会显示错误且不降级 | 部分配置和连接失败已 fail closed |
| `app.js:7,132` | 两项均不存在时启用 LocalStorage | 生产不合格；构建门禁必须阻止空配置产物 |
| `admin/admin.js:1,13-17` | 部分配置 fail closed；两项均空时启用本地审核模拟器 | 生产不合格；必须与前台共用生成的非空 `config.js` |
| `.env.example` | 只有变量名与占位符 | 不部署；继续作为服务端/测试说明文件 |
| `supabase/functions/admin-review/index.ts:3-6` | 从 Edge Function 环境读取 URL、服务角色变量、admin origins | 位置正确；任何 secret 值均不得进入前端或 Vercel 静态变量 |

Supabase 官方 [API keys](https://supabase.com/docs/guides/getting-started/api-keys) 将浏览器归为公开组件：浏览器应使用 `sb_publishable_...`，由 RLS 约束；`sb_secret_...` 和旧 `service_role` 会绕过 RLS，绝不能进入浏览器、静态产物或源码。阶段二生产构建建议只接受现代 `sb_publishable_` 前缀，拒绝 secret、service-role 和旧 JWT 形态，减少误配空间。

### 4.2 扫描结果（仅位置/类型，不记录值）

对基线 tracked 源码及 Git 全历史执行了高置信度模式检查。全历史未命中 private-key block、`sb_secret_`、GitHub personal token 或 JWT-like 字符串。发现项均为变量名、空值、占位符或隔离测试 fixture：

| 位置 | 类型 | 判断 |
|---|---|---|
| `.env.example:2-9` | Supabase URL、服务端角色变量名、测试邮箱/密码变量名 | 空值/占位符；禁止部署 |
| `config.example.js:3-4` | 浏览器公开 URL/key 槽位 | 空值；生产由构建生成 |
| `config.js:4-5` | 本地浏览器公开 URL/key 槽位 | 当前为空且 ignored；不提交 |
| `supabase/functions/admin-review/index.ts:3-6` | 服务端 URL、服务角色和 origin 环境变量读取 | 没有硬编码值；Edge Function 专用 |
| `tests/live-concurrency.cjs:2-7` | 隔离测试 URL、公开 key、账号和密码环境变量读取 | 没有硬编码真实凭据；禁止部署 |
| `tests/cloud-browser.test.cjs`、`tests/cloud-fixture.cjs`、`tests/version-review.test.cjs:238` | 假域名、假 publishable key、测试密码 literal | fixture 数据；禁止部署 |
| `.local/backups/` | ignored 源码备份 ZIP | 未纳入 Git 历史高置信度扫描；必须由 allowlist 构建排除 |
| `test-results/` | ignored 截图、日志、测试 JSON | 可能含测试页面数据；必须排除，不作为 Vercel artifact |

报告不包含任何密钥值。第二阶段应增加阻断规则：`sb_secret_`、private key block、GitHub token、JWT-like key、`SERVICE_ROLE` 出现在 `dist` 时立即失败。对 publishable key 只允许出现在生成的 `dist/config.js`。

### 4.3 阶段二生产配置规则

构建脚本应满足以下可测试规则：

1. `HUODA_SUPABASE_URL` 或 `HUODA_SUPABASE_PUBLISHABLE_KEY` 任一缺失，构建非零退出；不得留下可部署的旧 `dist`。
2. URL 必须是 HTTPS、无用户名密码、无 query/hash，host 与目标 Supabase 项目一致。
3. key 只接受 `sb_publishable_`；明确拒绝 `sb_secret_`、JWT-like、空白和换行。
4. 使用 JSON 序列化生成 `window.HUODA_CONFIG`，不做字符串拼接，避免引号或换行注入 JavaScript。
5. `CITY`、默认坐标可使用审核后的非敏感常量；所有业务数据仍从 Supabase/RLS 获取。
6. 生成后再次解析并断言两项配置非空，再扫描整个 `dist`；Vercel build 失败即不发布。
7. `config.js` 和 HTML 使用 `no-store` 或 `max-age=0, must-revalidate`。当前资源文件名未内容哈希化，JS/CSS 也不应设置长期 immutable 缓存。

## 5. Index、Admin、资源路径、大小写和 hash 路由

### 5.1 精确静态 allowlist

以下 27 个运行时文件是基线页面所需全集。另有 3 个许可证文件可显式发布。总计 30 个文件；按 Git blob 与取证时本地空配置计算共 355,534 bytes，生产 `config.js` 注入后总大小会变化。SHA-256 是 commit `6a95a0a` Git blob 的校验值；`config.js` 不在提交中，其哈希来自取证时的空本地配置。生产 `config.js` 必须重新计算，不能沿用表中空配置哈希。

| 路径（大小写必须一致） | Bytes | SHA-256 | 来源/用途 |
|---|---:|---|---|
| `index.html` | 4,394 | `b8631fb23dc0d3d0ea1de86d732d688a5ad04f0576b2ade2a989c5ad03c376f7` | `/` 入口 |
| `app.js` | 75,911 | `15aaed4cdcd5b120d2420d17142c1e33193f3faf5df0dcfe604ad21d1a191bfb` | index line 54 |
| `style.css` | 35,458 | `f84448a943c936c72461a880b383496899e8528171ac672b4b57e2cde5511230` | index line 9；admin `../style.css` |
| `responsive.css` | 13,845 | `3c9283b731284ad413893534524b85d5430e704fda3f760056a4ce2a41c2a34a` | index line 10 |
| `status.css` | 613 | `9bbabec65dbefb9aadfa50ee8eb58933b188bd26212470e14a0c2f11b24146c5` | index line 11 |
| `config.js` | 302 | `73a3815ad286c870a1f79060ac94958a24c5776f17b0879553f174e74fe6742d` | index line 53；admin `../config.js`；生产时构建生成且哈希变化 |
| `vendor/supabase-2.57.4.js` | 131,061 | `7e94b62086deecef8c0ba3b38f514e2a1944ff6c81d92fb3ff967828c406c38f` | 前台/后台动态加载；与安装包 UMD 逐字节一致 |
| `admin/index.html` | 559 | `d5de7332b2ba8243459b10e2056392702140f64d2fab82e8a978c622a49b6a19` | `/admin/` 入口 |
| `admin/admin.js` | 7,367 | `526d4c491eff0d74365c4d8a6b12cb440fdcc55bbd8d88416eb378308e40e795` | admin 相对脚本 |
| `src/core/services.js` | 3,227 | `37750650c7ec86f8c13907755c72e6f4eff45c763165c2b5e14b39cf7bbbac8c` | index line 55 |
| `src/services/locationService.js` | 763 | `8628a53c0f6904cb2dc24649a31d6865a13c5e6ec0b36e4eb5c065afa92fcd3b` | index line 56 |
| `src/services/recommendationService.js` | 416 | `8e4de7212016ffff613c70bc352106b08638cac36ec03e81704fc1b961ad0218` | index line 57 |
| `src/services/taskService.js` | 1,709 | `ede1013eeb9bfb47c6d924c770dd179d924fe8d549ef576cd460ce99c4ee60e5` | index line 58 |
| `src/services/applicationService.js` | 2,615 | `b5dc990384ba6214c336a061eaeaa8493ba2041bceab78e3a4645bac340bbe05` | index line 59 |
| `src/services/favoriteService.js` | 2,890 | `c106ace0bc0f9760daadc8498a33fd15484233ceb973d6de8a8f861a7fe976e7` | index line 60 |
| `src/services/messageService.js` | 1,690 | `4451bc2f8a22582b0d799882b3c0a69bdd6081abf3ba5cba29822aa155bb4153` | index line 61 |
| `src/services/inboxService.js` | 4,006 | `174c65f070c48d2355bc651826eafc1d4d8868faaafa716db9234001e4421ad3` | index line 62 |
| `src/services/notificationService.js` | 283 | `c2e5c7bafbb923550cb6960145cadc5af810f58a5d64eb71137c85f7bbc3e07f` | index line 63 |
| `src/services/reviewService.js` | 852 | `f7eb0d3a179221750fea727e272dce6c78c732dc2bc36772763a2f5999d81195` | index line 64 |
| `src/services/merchantService.js` | 2,290 | `fa971da1caafb5a9c1091190407cf2b9fabd7e51e64160cff1d5cdb28ea4b8cb` | index line 65 |
| `src/services/authService.js` | 2,466 | `e419e4cb10d5ff5cebeaa83046c6fdf2409009312586e091478ffb6ee728b7a3` | index line 66 |
| `src/pages/community.js` | 7,619 | `c0c9f3e3f2a2d6ff6efe6a9d2de1b7716dfb676c77fbd6e35c87f099942cfd22` | index line 67 |
| `src/pages/messages.js` | 8,259 | `9ff61e4e459c85d226fab4f7fa80ccf41c0effa38f416b3e03f011b8356d7033` | index line 68 |
| `src/pages/chatHistory.js` | 3,164 | `be7ea4d53d43f42164d9d0e9fe4afb945b53af0cdcbf0d928529b90fc11e18cd` | index line 69 |
| `src/pages/responsive.js` | 15,076 | `2b2cf3e69b412b3c14a764d346015321c868d20a5be4f81a470b4a1250d853e4` | index line 70 |
| `src/core/sync.js` | 4,138 | `5e93d1ad0d81432048f7080f7816c7f3ba7d200d9d8e013d37ff8cf3d588b1cb` | index line 71 |
| `src/core/bootstrap.js` | 227 | `c182f35f5acb7f38d3a85893fb72ef167027344c763508290f5bdd043d4ac79a` | index line 72 |
| `THIRD_PARTY_NOTICES.md` | 1,488 | `93d5e2131aab29adaa4a1ff00244a67c4c33ce51956236883f31d1bca7dd981e` | 明确允许的许可证告知 |
| `vendor/SUPABASE-LICENSE.txt` | 1,065 | `334dd6820e2eaeab2064e7c59001b810566728a28a41a7c1dbf69bbee17d0936` | Supabase SDK 许可证 |
| `vendor/DEPENDENCY_LICENSES.txt` | 21,781 | `f24ee5ff319a37e5265cd8299385bded8acc79f78bc3da06c07eaf13633efd60` | 依赖许可证合集 |

检查结果：所有 HTML 静态引用均有对应文件，大小写逐字匹配；76 个 tracked 文件中没有按小写折叠后的重名冲突。阶段二仍需在 Linux CI 和 Vercel Preview 上复核，因为 Windows 文件系统不能代表生产大小写行为。

### 5.2 路由矩阵

| URL | 类型 | 服务端要求 | 结果 |
|---|---|---|---|
| `/`、`/index.html` | 静态入口 | 返回 `index.html` | 必须 200 |
| `/#/home`、`/#/publish`、`/#/orders`、`/#/profile`、`/#/favorites`、`/#/messages` | 浏览器 hash 路由 | `#` 后内容不会发给 Vercel | 刷新仍只请求 `/`，无需 rewrite |
| `/#/detail/:id` | 浏览器 hash 深链 | 同上 | 客户端按 ID 恢复详情；无效 ID 可恢复 |
| `/#/chat/:id` | 浏览器 hash 深链 | 同上 | 未登录时转消息/登录流程 |
| `/#/publicProfile/:id/(merchant|worker)` | 浏览器 hash 深链 | 同上 | 客户端解析 |
| `/#/notifications` 或其它未知 hash | 浏览器 hash | 同上 | 当前解析器把未知 route 规范到 `#/home` |
| `/admin` | 目录入口 | 308 到 `/admin/` | 建议 `trailingSlash: true` |
| `/admin/` | 静态后台入口 | 返回 `admin/index.html` | 必须 200 |
| `/admin/admin.js`、`/style.css`、`/config.js`、`/vendor/supabase-2.57.4.js` | 后台依赖 | 按相对路径返回 | 必须 200，大小写错误必须 404 |

不要添加 `/(.*) -> /index.html` 的 SPA catch-all。应用已经使用 hash 路由，catch-all 会把 `/supabase.sql` 等错误路径伪装成 200 页面，削弱暴露检查并掩盖缺失资源。

## 6. 本地 server 白名单与 Vercel 暴露面

`scripts/serve.cjs` 当前固定允许：`index.html`、`app.js`、3 个 CSS、`config.js`、vendor SDK、admin 两个文件；另外允许 `src/core|services|pages` 下符合名称正则的 JS。它拒绝非 GET/HEAD、路径穿越、SQL、scripts、tests、node_modules、Git、Edge Function、config 样例和 lockfile；`tests/server-hardening.test.cjs` 对这些路径有本地测试。

这个实现适合作为本机预览边界，但它不是 Vercel 配置。当前若 Vercel 使用仓库根目录，以下文件会进入潜在静态暴露面：数据库 DDL/migrations/seed、Edge Function 源码、测试 fixture、脚本、README/部署文档、包清单、`.env.example` 和 `config.example.js`。这些文件多数不直接包含 secret，但公开它们会披露表结构、RPC 名称、权限假设、后台接口、测试账号命名和内部实施信息，并扩大未来误提交敏感内容的影响。

目标方案是“产物即白名单”：构建先清理临时输出，逐个复制第 5.1 节的 30 个文件，并在完成前比较 `dist` 实际集合与固定集合。任何多余、缺失、符号链接、大小写差异或非普通文件均使构建失败。`.vercelignore` 只承担第二道防线。

## 7. 仓库逐文件部署清单

基线 tracked 文件 76 个、Git blob 合计 617,792 bytes。第 5.1 节已有 26 个 tracked 运行时文件和 3 个 tracked 许可证文件；`config.js` 是 ignored 本地文件。其余 47 个业务外 tracked 文件与 3 个许可证的部署决定如下。许可证是唯一有意发布的非运行时内容。

| 文件 | Bytes | `dist` 决定 | 原因 |
|---|---:|---|---|
| `.env.example` | 379 | 排除 | 服务端/测试变量名 |
| `.gitignore` | 57 | 排除 | 仓库元数据 |
| `BRAND.md` | 7,521 | 排除 | 内部说明 |
| `MIGRATION.md` | 6,541 | 排除 | 数据库部署说明 |
| `README.md` | 10,334 | 排除 | 源码说明 |
| `TESTING.md` | 8,679 | 排除 | 测试与权限细节 |
| `THIRD_PARTY_NOTICES.md` | 1,488 | **允许** | 许可证告知 |
| `config.example.js` | 217 | 排除 | 空配置样例会触发 mock |
| `docs/DELIVERY_STATUS.md` | 1,057 | 排除 | 内部交付状态 |
| `docs/IMPLEMENTATION_PLAN.md` | 2,461 | 排除 | 内部计划 |
| `docs/V051_PC_实施记录.md` | 1,522 | 排除 | 内部实施记录 |
| `docs/V051_PC_开发验收报告.md` | 12,806 | 排除 | 内部验收细节 |
| `docs/V052_团队改进与验收报告.md` | 7,203 | 排除 | 内部验收细节 |
| `docs/V052_团队改进方案.md` | 2,402 | 排除 | 内部计划 |
| `docs/V053_导航调整说明.md` | 876 | 排除 | 版本说明 |
| `docs/云端接入_从这里开始.md` | 3,754 | 排除 | 部署说明 |
| `docs/V054_deploy_audit.md` | 本次新增 | 排除 | 安全审计报告 |
| `package-lock.json` | 8,603 | 排除 | 构建输入，不是网页资源 |
| `package.json` | 371 | 排除 | 构建输入，不是网页资源 |
| `scripts/build-v051-migration.cjs` | 2,713 | 排除 | 会写 migration 的开发脚本 |
| `scripts/check.cjs` | 537 | 排除 | CI/开发工具 |
| `scripts/inspect-responsive.cjs` | 1,025 | 排除 | 浏览器检查工具 |
| `scripts/serve.cjs` | 2,182 | 排除 | 本地预览 server |
| `supabase.sql` | 11,970 | 排除 | 数据库基线 DDL |
| `supabase/config.toml` | 43 | 排除 | Supabase CLI 配置 |
| `supabase/functions/admin-review/index.ts` | 3,602 | 排除 | Edge Function 服务端源码 |
| `supabase/migrations/202609100001_v050_foundation.sql` | 35,090 | 排除 | 数据库 migration |
| `supabase/migrations/202609100002_task_edit.sql` | 1,640 | 排除 | 数据库 migration |
| `supabase/migrations/202609100003_message_inbox.sql` | 2,410 | 排除 | 数据库 migration |
| `supabase/migrations/202609100004_desktop_sync.sql` | 4,932 | 排除 | 数据库 migration |
| `supabase/migrations/202609110005_service_hardening.sql` | 2,105 | 排除 | 数据库 migration |
| `supabase/seed.sql` | 2,796 | 排除 | 仅隔离测试数据，生产禁止 |
| `tests/browser-path.cjs` | 366 | 排除 | 测试辅助 |
| `tests/browser.test.cjs` | 4,560 | 排除 | 本地浏览器测试 |
| `tests/chat-history-browser.test.cjs` | 4,010 | 排除 | 本地浏览器测试 |
| `tests/cloud-browser.test.cjs` | 3,734 | 排除 | 模拟云合同测试 |
| `tests/cloud-fixture.cjs` | 9,123 | 排除 | 模拟服务与 fixture |
| `tests/cross-device-browser.test.cjs` | 8,800 | 排除 | 模拟跨端合同测试 |
| `tests/database.test.cjs` | 15,278 | 排除 | PGlite 数据库测试 |
| `tests/live-concurrency.cjs` | 2,190 | 排除 | 真实隔离项目 opt-in 测试工具 |
| `tests/messages-browser.test.cjs` | 6,479 | 排除 | 本地浏览器测试 |
| `tests/moderation-browser.test.cjs` | 3,680 | 排除 | 本地审核模拟测试 |
| `tests/responsive-browser.test.cjs` | 5,709 | 排除 | 本地浏览器/截图测试 |
| `tests/server-hardening.test.cjs` | 1,560 | 排除 | 本地 server 测试 |
| `tests/service-hardening.test.cjs` | 16,636 | 排除 | 服务与 SQL 合同测试 |
| `tests/sync-hardening.test.cjs` | 4,831 | 排除 | 同步与配置测试 |
| `tests/ux-improvements.test.cjs` | 10,274 | 排除 | 本地 UX 测试 |
| `tests/version-review.test.cjs` | 19,415 | 排除 | 版本回归与 fixture |
| `vendor/DEPENDENCY_LICENSES.txt` | 21,781 | **允许** | 依赖许可证合集 |
| `vendor/SUPABASE-LICENSE.txt` | 1,065 | **允许** | Supabase SDK 许可证 |
| `启动活搭.cmd` | 87 | 排除 | Windows 本地启动器 |

未跟踪/ignored 目录也必须排除：`.git/`、`.local/`、`node_modules/`、`test-results/`、`.vercel/` 和旧 `dist/`。构建不得递归复制仓库根目录。

## 8. 依赖与供应链

| 检查 | 结果 | 判断 |
|---|---|---|
| lockfile | npm lockfile v3；20 个依赖节点均有 integrity（根包除外） | 可用于可重复安装 |
| 生产依赖 | `@supabase/supabase-js 2.57.4` 及其传递依赖；`npm audit --omit=dev` 为 0 | 当前无 npm 已知生产漏洞 |
| 浏览器 vendor | `vendor/supabase-2.57.4.js` SHA-256 `7e94...c38f`，与 `node_modules/@supabase/supabase-js/dist/umd/supabase.js` 逐字节一致 | 已验证来源一致性 |
| 开发依赖 | `@electric-sql/pglite 0.3.14`、`@playwright/test 1.55.0` | PGlite 仅测试；Playwright 需升级 |
| 全依赖 audit | 2 个 high 节点，根因同一 Playwright 公告 | 阻断 CI 依赖安装/测试环境放行，生产 bundle 不含此代码 |
| 许可证 | `THIRD_PARTY_NOTICES.md` 与 vendor 两份许可证存在 | 构建显式保留 |

[GHSA-7mvr-c777-76hp](https://github.com/advisories/GHSA-7mvr-c777-76hp) 影响 Playwright `<1.55.1`，与浏览器安装/重装脚本的证书校验有关。当前项目固定 1.55.0，阶段二应升级后重新生成 lockfile。Vercel/CI 使用 `npm ci --ignore-scripts` 可降低安装脚本面，但不能代替升级。

## 9. GitHub Actions 与构建产物方案

当前没有 `.github/workflows`、Dependabot 配置、`build` script 或任何构建产物。阶段二建议新增以下部署工具文件，不触碰业务 HTML/CSS/JS：

| 文件 | 作用 | 关键限制 |
|---|---|---|
| `scripts/build-static.cjs` | 校验环境、清理并生成 `dist`、复制固定 allowlist、生成配置、校验集合/secret 模式 | 只用 Node 内置库；显式数组；遇错不留下可部署产物 |
| `scripts/verify-dist.cjs` | 独立复核路径、大小写、文件类型、HTML 引用、secret 模式和配置状态 | CI 与本地都可运行；拒绝额外文件 |
| `package.json` | 增加 `build`、`verify:dist`、安全检查 script | 保留现有原生栈和命令 |
| `vercel.json` | `framework:null`、`outputDirectory:dist`、`trailingSlash:true`、headers | 不使用 broad rewrite；CSP connect-src 绑定真实公开 Supabase origin |
| `.vercelignore` | 排除所有源码/测试/SQL/本地状态 | 纵深防护，不能替代 dist |
| `.gitignore` | 增加 `.env*` 例外、`.vercel/`、`dist/` | 保留 `.env.example` tracked |
| `.github/workflows/ci.yml` | Linux CI：安装、audit、check、test、build、verify | `permissions: contents: read`；checkout 不持久化凭据；不把 secret 传给 fork PR |
| `.github/dependabot.yml` | npm 定期更新与安全修复 | 小批量、可复核 |

建议 CI 顺序：

1. `npm ci --ignore-scripts`
2. `npm audit --omit=dev --audit-level=high`
3. `npm run check`
4. `npm test`
5. 使用 CI 专用测试 Supabase 公开值运行 `npm run build`；PR 来自 fork 时改用显式的非生产占位 publishable 值，只验证构建规则，不访问外部项目
6. `npm run verify:dist`
7. 检查 `git diff --exit-code -- package-lock.json`，避免安装漂移
8. 仅上传 `dist` 作为 CI artifact；不得上传 `.env`、`.vercel`、`test-results` 或源码备份

GitHub Actions 应使用固定 major 或 commit SHA 的官方 actions、最小权限、并发取消旧运行；不在 workflow 文本中写任何 key。Vercel Production 必须要求目标分支 CI 通过，并先检查 Preview。

## 10. 安全响应头与缓存建议

阶段二应在 `vercel.json` 配置并通过浏览器回归验证：

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`：`default-src 'self'`；`object-src 'none'`；`base-uri 'self'`；`frame-ancestors 'none'`；`connect-src` 仅允许自身与目标 Supabase HTTPS/WSS origin。当前页面大量使用内联事件属性，需要 `script-src-attr 'unsafe-inline'` 兼容；不能误写一个会让所有按钮失效的 CSP。后续重构事件绑定后再去掉该例外。
- `Permissions-Policy`：只给自身保留业务需要的 geolocation，其余 camera、microphone、payment 等默认关闭。
- HTML 与 `config.js`：`no-store` 或 `max-age=0, must-revalidate`。
- 当前未内容哈希化的 JS/CSS：`max-age=0, must-revalidate`。不要设置 `immutable`，否则新部署可能出现 HTML 与旧脚本混用。

预览部署必须同时验证 CSP console、Auth 回调、Supabase REST/Realtime、定位、signed URL 新窗口和 admin Edge Function，避免安全头误伤真实业务。

## 11. 轻量 STRIDE 威胁模型

### 11.1 数据流与信任边界

1. 不可信公网用户 → Vercel 静态 `dist`。
2. 浏览器中公开代码与 publishable key → Supabase Auth/Data API/Realtime/Storage；RLS 是主要授权边界。
3. 管理员浏览器 → `admin-review` Edge Function；用户 JWT + `admin_users` 决定权限。
4. Edge Function → Supabase 数据库/私有 Storage；server secret/service-role 仅存在于服务端环境。
5. GitHub commit/Actions → Vercel build/deploy；构建产物完整性决定客户端代码完整性。

### 11.2 威胁与可测试要求

| STRIDE | 威胁 | 风险 | 可测试要求 |
|---|---|---|---|
| Spoofing | 把 publishable key 当作用户身份，或伪造 admin metadata | 高 | 所有私有访问依赖 Auth JWT + RLS；Edge Function 调 Auth `getUser` 并查询 `admin_users`；非 admin 403 |
| Tampering | PR/依赖/构建过程替换静态 JS 或注入配置 | 高 | 受保护分支、lockfile、最小权限 CI、固定 allowlist、SHA/集合校验、Preview smoke |
| Repudiation | 管理员否认审核操作 | 中 | `admin_moderate` 继续写 `audit_logs`，真实云端核对 actor、前后值和时间 |
| Information disclosure | 根目录发布 SQL、测试、备份、凭据；secret 进入 `config.js` | 严重 | 只发布 dist；禁用路径公网 404；secret pattern 构建阻断；浏览器只含 publishable key |
| Denial of service | 缓存错配或配置缺失导致前端不可用；实时连接异常 | 中 | 配置构建 fail-fast；非 immutable 缓存；网络错误保留恢复入口；Preview 断网/重连测试 |
| Elevation of privilege | 前端或后台误用 service-role 绕过 RLS | 严重 | dist 中 `SERVICE_ROLE`/secret 为零；Edge Function server secret 不返回；逐表/RPC RLS 真云测试 |

## 12. 现有测试证据与不足

### 12.1 当前可确认的证据

- 本阶段只运行了不写测试产物的 `npm run check`：42 个 JS/CJS 文件语法通过。
- 读取到 2026-09-11 的本地测试日志：65 项通过、0 失败、0 跳过，约 18.4 秒。日志是 ignored 本地证据，并非本阶段重新执行。
- `tests/server-hardening.test.cjs` 对本地 Node server 的 allowlist、路径穿越、方法和 `nosniff` 有覆盖。
- `tests/cloud-browser.test.cjs` 覆盖部分云配置报错和网络失败不降级。
- PGlite/浏览器 fixture 覆盖了大量 RLS/RPC、账号切换、消息和响应式合同。
- 本阶段 `npm audit --omit=dev`：0；完整 `npm audit`：Playwright 相关 2 个 high 节点。

没有运行 `npm test`，因为现有浏览器测试会写入 `test-results/`，与本阶段“唯一写入审计报告”的限制冲突。

### 12.2 不能支持生产放行的缺口

1. 本地 server 测试不能证明 Vercel 根目录未暴露，也没有 Preview URL 禁用路径探测。
2. 现有配置测试覆盖“只填一项”，没有覆盖生产环境“两项都缺失也必须 fail closed”。
3. 没有 build/`dist` 清单、Linux 大小写、HTML 资源图、生成配置语法和秘密扫描测试。
4. 没有验证 Vercel headers、缓存、`/admin -> /admin/`、错误大小写 404 和无 broad rewrite。
5. 云浏览器与跨设备测试使用模拟 HTTP、共享 PGlite 或关闭 Realtime；不是目标 Supabase、PostGIS、跨连接并发或真实手机/电脑验收。
6. 没有真实验证 Supabase Auth 邮件/回调、Realtime、私有 Storage、signed URL、Edge Function 部署和生产 `ADMIN_ALLOWED_ORIGINS`。
7. 没有 CI 自动执行 SCA/secret scan，也没有 Playwright 漏洞修复后的回归证据。
8. 未对 ignored 的 `.local` 备份 ZIP 和 `test-results` 内容作凭据取证；安全设计应通过 dist allowlist 保证它们永不进入部署上下文。

## 13. 阶段二实施与验收顺序

阶段二取得 build/vercel/config/CI 相关文件写权限后，建议按以下顺序实施：

1. 修复 Playwright 依赖并更新 lockfile；运行语法与全量本地测试。
2. 添加 `build-static` 与 `verify-dist`；先以测试公开值验证缺失、半缺失、secret/JWT、恶意换行均失败，正确 publishable 值成功。
3. 添加 `dist` 精确文件测试：30 个文件，无额外文件；逐个 HTML 引用存在且大小写一致；许可证保留。
4. 更新 `.gitignore`，添加 `.vercelignore`，再验证 ignored 本地文件没有进入 `dist`。
5. 添加 `vercel.json`：Other、`dist`、trailing slash、安全头、缓存；不添加 SPA catch-all。
6. 添加 GitHub Actions/Dependabot，确保无 secret 的 PR 也能完成离线合同门禁。
7. 使用独立测试 Supabase 公开 URL/key 构建 Preview；对允许资源做 200/Content-Type/大小检查，对 SQL、migration、tests、scripts、docs、lockfile、`.env*`、`.git`、`.local`、`test-results`、Edge Function 源码做 404 检查。
8. 配置 Supabase Auth URL、RLS/migrations、Edge Function 和精确 admin origin；执行 TESTING.md 的 A-H、Realtime 和真实设备验收。
9. Preview 全部通过后才申请生产部署授权；本审计没有授权任何外部部署。

生产放行的最小门槛：D-01～D-09 全部关闭；生产构建无本地 mock；dist 无 secret/源文件；Preview 路径与 headers 通过；真实 Supabase 和手机/电脑验收有可复核证据。

## 14. 本阶段验证记录

| 项目 | 结果 |
|---|---|
| HEAD/tag | `6a95a0a...` / `v5.3-stable` |
| 阶段开始工作区 | clean；审计冻结到 `6a95a0a` |
| 本审计业务代码修改 | 0 |
| 本审计新增文件 | 仅 `docs/V054_deploy_audit.md` |
| 并发工作区变化 | 报告写入后检测到另一来源的未提交变更；未覆盖、未纳入本报告验证 |
| 基线 tracked 清单 | 76 文件；Git blob 合计 617,792 bytes |
| 基线运行时 + 许可证候选 | 30 文件；含取证时空配置共 355,534 bytes |
| HTML 引用 | 全部存在，大小写匹配 |
| tracked 大小写冲突 | 0 |
| 高置信度当前/历史 secret | 0 个已确认；仅变量名、空值、占位符和 fixture |
| 生产 npm audit | 0 漏洞 |
| 全依赖 npm audit | Playwright 根因的 2 个 high 节点 |
| `npm run check` | 42 个文件通过 |
| 完整测试 | 本阶段未重跑；已有 2026-09-11 日志为 65/65 本地通过 |
| 外部变更/部署 | 0 |
