# HUODA v5.4 前端审计与最小改造规划

> 本文保留实施前发现。对应修复与最终验证结果见 `V054_升级与验收报告.md`。

> 阶段：第一阶段，只检查、不修改业务代码  
> 审计日期：2026-09-12  
> 基线：`v5.3-stable` / `6a95a0a0fda1d341b2555e11e82f1bdfeaea8436`  
> 目标：为 v5.4 云端业务状态闭环准备前端改造边界，保留 v5.3 UI，保持纯 HTML/CSS/JS。

## 1. 审计范围与结论

已完整阅读并交叉检查：

- `app.js`
- `index.html`
- 全部前台 CSS：`style.css`、`responsive.css`、`status.css`
- `src/pages/`：`community.js`、`messages.js`、`chatHistory.js`、`responsive.js`
- `src/core/`：`services.js`、`sync.js`、`bootstrap.js`
- `src/services/` 全部 11 个 Service，以及它们在 `app.js`、`src/pages/`、`src/core/` 的调用位置
- 为确认前端状态是否有现存云端契约，定向核对了 `supabase.sql` 和现有 migration 中的任务/报名状态约束与 RPC

结论：5.3 已有可保留的响应式 UI、基础 Service 层、会话恢复和本地/云端分支，不需要重做 UI 或更换框架。v5.4 的阻塞项是业务状态契约不完整，以及页面层还在直接访问 Supabase/LocalStorage，导致页面自行推断状态、多处重复加载。

当前 `config.js` 的 `SUPABASE_URL` 和 `SUPABASE_KEY` 仍为空，本次只能确认源码契约和本地逻辑，不能将审计结果表述为真实 Supabase、手机/电脑或跨设备验收通过。

## 2. v5.4 状态契约差距

### 2.1 任务状态

v5.4 需要的用户可见状态是：

| 前端规范值 | 用户文案 | 公开任务流 | 主要操作 |
|---|---|---|---|
| `draft` | 草稿 | 不展示 | 编辑、提交审核 |
| `pending` | 审核中 | 不展示 | 查看审核进度；驳回后返回可编辑态 |
| `recruiting` | 招聘中 | 展示 | 报名、收藏；商家管理报名 |
| `full` | 已满员 | 不再接收报名 | 商家跟进已接受人员；退出后由云端决定是否恢复招聘 |
| `ended` | 已结束 | 不展示 | 只读记录、完成/评价后续 |
| `off_shelf` | 已下架 | 不展示 | 只读保留；是否可重新编辑并提审由云端 `allowed_actions` 决定 |

现状不符：

1. `supabase.sql:40` 的初始约束是 `open/closed/paused`；`202609100001_v050_foundation.sql:41-43` 迁移后变为 `open/paused/closed/completed`，另有 `review_status=pending/approved/rejected`。这两套字段没有形成上述六态的唯一前端契约。
2. `src/services/taskService.js:5` 新建任务直接是 `review_status='pending' + status='open'`，不存在云端业务草稿。`app.js:526-533` 所谓草稿只是当前标签页的 `sessionStorage` 表单恢复，无法跨设备、无法出现在“我发布的”。
3. `app.js:331` 只使用 `review_status/status/spots_left` 当场组合按钮；`app.js:358-363` 的商家列表只显示审核状态，没有草稿、招聘中、满员、结束、下架的管理动作。
4. `src/services/applicationService.js:3` 使用 `closed` 表示满员，使用 `completed` 表示任务结束；页面没有统一转换层，继续扩展会在更多组件中堆叠判断。

前端最小约定：页面只消费 Service 返回的 `lifecycle_status`、`status_label`、`allowed_actions`，不再自行根据 `review_status + status + spots_left` 推断。底层是增加单一云端状态字段，还是在 RPC/Service 中将现有字段投影为六态，由第二阶段的后端契约确定；前端不应同时兼容多套业务语义。

### 2.2 报名状态

v5.4 需要：`applied` → `viewed` → `communicating` → `accepted` / `rejected`，后续为 `completed` / `cancelled`。实际合法跳转必须由云端 RPC 根据操作人和当前状态决定，前端仅渲染 `allowed_actions`。

现状不符：

1. `supabase.sql:61` 和现有 `transition_application` 只支持 `applied/accepted/rejected/completed/cancelled`，缺少 `viewed` 与 `communicating`。
2. `src/services/applicationService.js:3` 的商家接受/拒绝只允许从 `applied` 进入，无法在“已查看”或“沟通中”后决策。
3. `app.js:89-90`、`app.js:362-378`、`src/pages/messages.js:14-18`、`src/pages/responsive.js:21,36,46` 各自硬编码旧状态标签、进度条、筛选和按钮，增加两态后会出现页面间不一致。
4. `app.js:386,398`、`src/services/messageService.js:2`、`src/services/inboxService.js:8` 将聊天主要绑定在 `accepted/completed`。这无法表达“沟通中”，而且 `completed` 仍可发新消息，与 `app.js:399` 已结束后只读的文案意图不一致。
5. `app.js:372` 的进度条只有“报名 / 商家确认 / 完成”，用户看不到已查看和沟通中。

建议 Service 返回的报名视图至少包含：

```js
{
  id, task_id, worker_id, merchant_id,
  status, status_label,
  allowed_actions: ['view', 'communicate', 'accept', 'reject', 'complete', 'cancel'],
  can_chat, chat_read_only,
  viewed_at, communicating_at, accepted_at, completed_at, cancelled_at,
  updated_at
}
```

## 3. 可验证的前端问题

### F-01 [P1] 游客可以收藏，违反 v5.4 登录边界

- `app.js:50-55` 初始化并写入游客收藏 `huoda_favorites_v050_guest`。
- `src/services/favoriteService.js:3,29-31` 明确在未登录时读写游客收藏。
- `app.js:260,331` 和 `src/pages/responsive.js:31` 的收藏按钮直接调用 `toggleFavorite`，没有 `requireLogin`。
- `app.js:320` 的收藏页也可在未登录时进入。

最小修改：在统一动作守卫中对 `favorite/apply/chat/publish` 要求登录；`favoriteService` 未登录时抛 `AUTH_REQUIRED`。不再新建游客收藏；现有游客键如何处理需在第二阶段单独定义，避免静默丢数据。

### F-02 [P1] “发布”不是进入即登录

- `index.html:23,46` 的桌面与移动发布入口直接 `go('publish')`。
- `app.js:338-356` 对游客仍渲染完整发布表单，只在最后按钮通过商家认证流间接引导登录。
- `src/pages/responsive.js:12` 的“商家入口”已有登录守卫，两个入口行为不一致。

最小修改：由路由守卫统一处理 `publish/favorites/orders/messages/chat`；登录成功后恢复原目标路由和子页状态。首页、任务详情和公开档案保持游客可浏览。

### F-03 [P1] 页面层绕过 Service，云端/本地分支泄漏到 UI

需迁移的页面/应用层直连：

| 位置 | 直接调用 | 目标 Service |
|---|---|---|
| `app.js:112-129,429,436` | `sb.auth.*` | `authService.init/onChange/signIn/signUp/signOut` |
| `app.js:150-166` | `sb.from(...)` + `localDb()` 批量读状态 | 各业务 Service 的 `listMine/list` |
| `app.js:428,434,436` | 本地账号直接读写 `localDb()` | `authService` 本地适配分支 |
| `app.js:452` | `H.rpc('submit_report')` / `H.localWrite` | 新增 `reportService.submit` |
| `src/pages/community.js:22` | `H.rpc('edit_task_details')` / `H.localWrite` | `taskService.updateDetails` |
| `src/pages/messages.js:39-43` | 直读 `notifications/reports/localDb` | `notificationService.list` + `reportService.listMine` |

`src/services/*` 内部使用 `sb.from/sb.storage/H.rpc/H.localWrite/localDb` 是现有适配层的职责，可在第二阶段保留这种轻量结构。`src/core/services.js:26-31` 继续作为 RPC 解包和本地写锁基础设施；页面层不应再调用它们。

`ensureCloudClient()` 中创建 Supabase client 是 bootstrap 职责，不属于业务直连，可保留在 core/bootstrap 边界。

### F-04 [P1] `loadData()` 过度加载，同一数据重复查询

- `app.js:139-170` 在大部分路由一次加载全部 applications、reports、notifications、reviews、ownTasks、favorites，最后还在所有路由调用 `inbox.load()`。
- `src/pages/messages.js:33-43` 刷新消息时又查一次 notifications/reports，与 `loadData()` 重复。
- 任何一个非当前页面的查询失败，都可能拖累整个页面刷新，不利于真实云端环境下的弱网表现。

最小修改：保留 `loadData()` 作为调度器，它只并行调用 Service，并按当前路由选择数据。首页只需公开任务和必要徽标数；“我的”、“消息”、“发布管理”各自加载所需数据。

### F-05 [P1] 业务状态与允许动作由多个页面自行判断

分散点包括 `app.js:89-92,324-331,339-378,386-399,418-420`、`src/pages/messages.js:14-18`、`src/pages/responsive.js:20-21,31,36,44-55`。同一状态同时决定文案、颜色、按钮、进度条、聊天权限和计数，目前没有单一来源。

最小修改：

- 在 `src/core/` 放纯展示状态目录，统一 label/tone/progress step，不存取数据。
- 操作权限使用 Service/RPC 返回的 `allowed_actions`，不用页面布尔表达式代替云端权限。
- 后端仍必须在 RPC/RLS 中再次验证；隐藏按钮不是权限控制。

### F-06 [P1] 真实业务状态刷新不够及时

- `src/services/messageService.js:4` 的 Realtime 只订阅 `messages` 和当前用户的 `notifications`。
- 任务满员/恢复招聘、任务结束/下架、报名被查看/沟通/接受等变化不会直接触发订阅。
- `src/core/sync.js:56-57` 依赖窗口聚焦和 15 秒轮询补齐，能最终刷新，但不足以支撑“真实业务状态闭环”的及时反馈。

最小修改：仍使用“Realtime 只做失效通知，Service 重读权威数据”的现有策略，但按当前账号增加 applications/tasks 的可见变化订阅，或由状态 RPC 统一写入用户 notifications 来触发重读。15 秒轮询继续作为兜底。

### F-07 [P2] 路由只恢复顶层页，刷新会丢失业务上下文

`app.js:535-557` 可恢复 home、publish、orders、profile、favorites、messages，以及带 ID 的 detail/chat/publicProfile，这是可保留的基础。但以下状态没有进入 URL：

- `publishTab`：刷新“我发布的”后回到新发布表单。
- `orderTab`：刷新商家报名管理后回到求职者视图。
- `messageTab`：`go('notifications')` 会归一为 messages，刷新通知页后回到聊天。
- `profileSection`：桌面个人中心的“我的收藏/评价/我发布的”等子页刷新后回到默认报名页。
- `inboxFilter`、`inboxQuery`和 `findWork` 仅在内存中，刷新后丢失。

最小修改：继续使用 hash router，为用户可见子页增加简单参数，例如 `#/publish?tab=mine`、`#/orders?role=merchant`、`#/messages?tab=notices`、`#/profile?section=posts`。搜索词是否入 URL 可延后，但不应因 Realtime 重渲染丢失输入。

### F-08 [P2] 重复查询与无效/死码会干扰 5.4 改造

本次检查的 11 个 Service 都有实际调用，不存在“整个 Service 未使用”。但有以下可验证残留：

- `src/pages/community.js:2` 的 `refreshNotifications()` 无调用。
- `app.js:44` 的 `adminTab` 只初始化，无读取；`app.js:501` 的 `admin()` 只跳转 profile，hash router 不支持 admin，也没有前台入口。
- `app.js:158,164,166` 仍写入 `state.unreadCount`，但徽标已统一使用 `chatUnread + noticeUnread`。
- `app.js:200`、`style.css:20,74-80`、`responsive.css:29` 仍查找/样式化 `#notificationBtn`，`index.html` 已无该元素。
- `style.css:114-118,139,144,153-156,259-262`、`responsive.css:36` 保留了无运行时元素对应的旧搜索框、旧任务卡和 admin 样式。

第二阶段不应为了“清理干净”先大删 CSS。建议在状态闭环通过回归后，再按实际 DOM 覆盖检测移除上述残留，避免破坏 v5.3 的视觉基线。

### F-09 [P2] 基础 SQL 和最终 migration 约束存在版本表述差异

`supabase.sql:40` 不包含 `completed`，而 `202609100001_v050_foundation.sql:41-42` 会替换该约束并加入 `completed`。按项目文档的完整迁移顺序部署时，`transition_application` 将任务写为 `completed` 不会被该约束拒绝；不应将它误报为当前已迁移数据库的必现故障。

风险是新环境如果只根据基础脚本理解最终 schema，会得到错误契约。v5.4 数据库负责人需提供可验证的最终状态约束和新环境部署顺序，前端只依赖最终 RPC 契约。

## 4. Service 调用现状与迁移目标

### 4.1 现有 Service 使用情况

| Service | 主要消费位置 | 判定 |
|---|---|---|
| `authService` | `app.js:137,438,441`，其他 Service 使用 capture/assert | 已使用，需接管全部 `sb.auth` 与本地登录 |
| `taskService` | `app.js:177,365,514`，`src/core/sync.js:37` | 已使用，需增加草稿、我的任务、更新与生命周期接口 |
| `applicationService` | `app.js:336,374,376,378` | 已使用，需增加 list/viewed/communicating 及七态动作 |
| `favoriteService` | `app.js:55,113,123,132,161,166,320,428,434`，`responsive.js:55` | 已使用，需改为只有登录账号可读写 |
| `messageService` | `app.js:127,133,392,409`，`sync.js:22` | 已使用，需改为根据 `can_chat/chat_read_only` 执行 |
| `inboxService` | `app.js:169,385,392-393,411`，`messages.js`、`chatHistory.js`、`sync.js` | 已使用，需接纳 `communicating` 和终态只读会话 |
| `notificationService` | `community.js:3-4` | 已使用，需增加 list 以移除页面直连 |
| `reviewService` | `community.js:20` | 已使用，可保留并改为依赖 `allowed_actions` |
| `merchantService` | `app.js:389,447`，`community.js:7`，`responsive.js:34`，`sync.js:44` | 已使用，可保留 |
| `locationService` | `app.js:210,495`，`recommendationService` | 已使用，可保留 |
| `recommendationService` | `app.js:213` 间接被首页和响应式推荐使用 | 已使用，可保留 |

### 4.2 v5.4 最小 Service 接口

不引入新框架，继续使用 `window.H.services` 和普通 script 加载。页面层只调下列接口：

```js
H.services.auth.init()
H.services.auth.onChange(handler)
H.services.auth.signIn({ email, password })
H.services.auth.signUp({ email, password, name })
H.services.auth.signOut()
H.services.auth.hydrate(user)
H.services.auth.save(patch)

H.services.task.search(filters)
H.services.task.get(id)
H.services.task.listMine()
H.services.task.saveDraft(payload, id = null)
H.services.task.submitForReview(id)
H.services.task.updateDetails(id, patch)
H.services.task.transition(id, action) // end / off_shelf / resubmit，以云端 allowed_actions 为准

H.services.application.listMine({ role })
H.services.application.apply(taskId)
H.services.application.markViewed(applicationId)
H.services.application.startCommunication(applicationId)
H.services.application.transition(applicationId, action)

H.services.favorite.list()
H.services.favorite.toggle(taskId)     // 未登录抛 AUTH_REQUIRED
H.services.favorite.tasks()

H.services.inbox.list(query)
H.services.inbox.conversation(applicationId, { before })
H.services.message.send(applicationId, content)
H.services.message.read(applicationId)
H.services.message.subscribe()

H.services.notification.list()
H.services.notification.read(id = null)
H.services.report.listMine()
H.services.report.submit({ taskId, reason, detail })
H.services.review.listMine()
H.services.review.submit(applicationId, rating, tags, comment)
```

所有状态写入继续通过 RPC，不由前端 `update()` 任意写表。Service 内部保留云端/本地双分支，两个分支返回同一 DTO 和错误码。页面、`app.js` 的路由/渲染代码不再出现 `sb.from`、`sb.auth`、`H.rpc`、`H.localWrite`、`localDb()`。

### 4.3 建议迁移顺序

1. 先锁定云端六态/七态枚举、转移权限、`allowed_actions` 和 DTO；不先改页面文案。
2. 扩展 `taskService/applicationService/authService/notificationService`，新增 `reportService`，使云端与本地返回相同视图。
3. 将 `app.js`、`community.js`、`messages.js` 中的直连迁入 Service，保持页面函数名和现有 DOM 结构尽量不变。
4. 将状态 label/tone/progress 集中到 core 展示目录，将按钮改为根据 `allowed_actions` 渲染。
5. 增加路由守卫和子页恢复，最后接入 tasks/applications 的失效通知刷新。
6. 在状态闭环验收后才删除确认无用的函数与 CSS，防止清理工作扩大 UI 回归面。

## 5. 保留 v5.3 UI 的最小变更规划

保留不变的结构：

- 移动端底部四入口：找活、发布、消息、我的。
- 桌面端顶部导航、全局搜索、三栏首页、详情右侧操作卡、消息双栏和个人中心侧栏。
- 768px/1200px 断点、HUODA 黑/草绿配色、卡片层级、现有 `.status/.seg/.merchant-card/.order-card/.btn-row/.primary/.secondary` 组件。
- “消息”为一级入口，聊天和系统通知分开；报名/接受工作记录继续放在“我的”。

只增加以下 UI 表达：

1. 发布表单底部在现有按钮区增加“保存草稿”和“提交审核”；不新建发布页。
2. “我发布的”现有卡片显示六态 chip，并按 `allowed_actions` 显示编辑、提审、结束、下架等少量文字按钮。
3. 任务详情的现有主 CTA 改为 Service 驱动；招聘中可报名，其他状态显示对应文案并禁止报名。
4. 商家现有报名卡增加“已查看”和“发起沟通”状态/动作；不新建 CRM 页。
5. 求职者现有进度条补全已查看、沟通中；在窄屏上允许横向滚动或改为紧凑四段文案，不改卡片主体。
6. `communicating/accepted` 的会话允许发送；`completed/rejected/cancelled` 有历史时只读。最终以云端返回的 `can_chat/chat_read_only` 为准。

公开首页任务流只展示 `recruiting`，不为草稿、审核中、满员、结束、下架增加新公开卡片样式。这些状态只在任务所有者、已参与者的记录或原有详情上下文中展示。

## 6. 第二阶段验收门槛

实施后至少需要以下可重复证据：

1. 静态边界：`app.js` 和 `src/pages/` 不再命中 `sb.from/sb.auth/H.rpc/H.localWrite/localDb()`；直连只存在 core bootstrap 或 `src/services/`。
2. 任务六态：草稿保存、提审、审核通过、招满、退出后恢复名额、结束、下架的 Service 契约测试。
3. 报名七态：所有合法跳转成功，越权和非法跳转由 RPC 拒绝；并发接受不超招聘人数。
4. 游客：首页、搜索、详情、公开档案可浏览；收藏、报名、聊天、发布首次操作均弹登录，登录后恢复原动作。
5. 路由：直达和刷新 detail/chat，以及 publish/orders/messages/profile 的业务子页，状态不串页；退出后不残留前一账号数据。
6. 刷新：任务/报名/消息变化以 Realtime 失效通知后重读；保留聊天草稿、焦点、光标和滚动位置，15 秒轮询作为兜底。
7. UI 回归：375×812、430×932、768×1024、1366×768、1440×900、1920×1080；检查不溢出、导航/搜索/任务卡/消息/个人中心与 v5.3 视觉基线一致。
8. 真实云端：在已配置 Supabase 且完成 v5.4 migration 的环境中，用两个真实账号在手机和电脑走完任务发布到报名完成。本地、mock、PGlite 或同一浏览器多标签页只能作部分证据，不代替该验收。

## 7. 本阶段边界

本文档是第二阶段的前端实施输入，不包含业务代码、CSS、HTML、SQL、测试或云端配置变更。开始第二阶段前，需先由业务/后端契约确认六态与七态的最终转移表、操作权限、满员回退规则和聊天可写边界；前端按本报告的 Service 边界做增量改造，不重做 UI。
