# 活搭 HUODA v0.5.0

基于 v0.4.3 渐进升级的移动端 Web App，保留首页、Logo、口号、任务卡和墨黑 / 暖白 / 青柠绿品牌。原版目录未修改。

## 立即运行

本机已安装 Node.js。在本目录执行 `npm start`，打开 http://127.0.0.1:8085 。也可双击 `启动活搭.cmd`。

- 普通用户入口：`/`
- 独立审核入口：`/admin/`
- 本地演示无需 npm install、数据库或联网。SDK 已包含在 vendor。
- 使用 localhost，不建议直接双击 index.html，以保证定位、跨标签数据与浏览器安全 API 可用。

## 数据模式与配置

`config.js` 中 SUPABASE_URL / SUPABASE_KEY 留空：LocalStorage 演示，独立命名空间 `huoda_mvp_v050`，不修改旧版缓存。演示账户只是身份切换，密码不存储、不校验，不能保管真实信息。

填入真实 Supabase URL 与 **publishable / anon key**：启用 Auth、RPC、RLS、Storage、Realtime。连接失败显示错误，不会悄悄切换演示数据。config.js 不进入 Git，缺少时复制 config.example.js。

**service_role 只允许存在于服务端环境变量，不能写入任何前端配置。**

## P0 功能

| 能力 | 实现 |
|---|---|
| 游客 | 浏览、搜索、组合筛选、详情、公开信用页、收藏；报名时登录 |
| 附近 | WGS84，默认 3km，可选 1/3/5/10km；云端 PostGIS ST_DWithin/ST_Distance/GIST |
| 查询 | 服务端过滤、真实总数、每页 20 条、加载更多、280ms 防抖、过期响应丢弃 |
| 金额时间 | 整数分，保留旧金额；可选开始/结束时间；明确工作地点坐标 |
| 报名 | RPC 鉴权、唯一约束、任务行锁、确认扣名额、已接受撤回归还名额 |
| 收藏 | 游客登录合并、账户隔离、云端同步；失败保留待合并数据 |
| 消息通知 | 文本、系统消息、已读、Realtime、总未读角标、通知跳对应接单/会话 |
| 评价档案 | 完成后双方各一次评价；技能简介、头像 URL、完成数、评分及真实评价 |
| 认证 | JPG/PNG/PDF，10MB，私有 Storage path，审核员 60 秒 signed URL |
| 审核 | 独立商家/任务/举报队列；Edge Function 验 JWT/admin_users，数据库审计 |
| 任务修改 | 未确认用人的任务可改标题/时间说明/内容，修改后强制重新审核 |
| 演示 | 8 条本地任务、独立审核模拟器、28 条云端测试 seed |

“为你匹配”是规则分，不是 AI 概率：技能重合 40、3km 内 20、近 7 天 5。未采集的偏好和历史行为项不加分，目前最高 65 分；无技能游客按新近任务排序。

## 本地体验流程

1. 游客搜索“设计”→线上→详情→收藏→接单→弹窗选“体验求职者”。
2. 我的→退出→体验已认证商家→接单→商家待确认→确认用人，名额减少。
3. 双方从接单或右上角通知入口聊天；打开会话标记已读。
4. 切回求职者→标记已完成→评价；切回商家也可评价。详情商家名进入信用页，报名记录可查看求职者档案。
5. 注册新本地商家→商家认证→18 位信用代码及测试文件→独立 `/admin/` 认证通过→发布→后台任务审核。
6. 任务详情举报→后台处理→通知中心查看状态。

本地审核模拟器没有真正权限边界，只能操作本地演示数据，不能影响云端。

## Supabase 初始化

详细步骤见 [MIGRATION.md](MIGRATION.md)。新库先执行根目录 `supabase.sql`，再依序执行 `supabase/migrations/*.sql`；旧 v0.4.3 库只运行两份 migration，**不要再执行旧基线覆盖新 RLS**。

在隔离测试项目创建 Auth 账号：merchant@huoda.test、worker@huoda.test、admin@huoda.test，自行设置密码，然后执行 `supabase/seed.sql`。seed 不能用于生产。

配置 Auth Site URL、Redirect URLs、邮箱验证策略。config.js 填入 URL/公开 key。安装并登录 Supabase CLI 后部署：

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ADMIN_ALLOWED_ORIGINS=https://admin.example.com
supabase functions deploy admin-review
```

Edge Function 平台提供服务角色环境变量。管理员只能由数据库管理员写入 admin_users。审核页面独立部署或使用独立路径，保留相对 config/vendor/style 路径；普通 App 没有审核入口。SQL Editor 与 CLI 应选定一种 migration 历史管理方式，避免重复执行。

## 结构

app.js 保留页面模板和路由；src/core 是服务边界与初始化；src/services 包含 10 个业务服务；src/pages/community.js 是通知、档案、评价、修改任务页面。admin 是独立审核页面，supabase/functions 是服务端审核接口，supabase/migrations 是增量迁移。tests 包含数据库权限、浏览器流程和云端 SDK 合同测试。

## 检查

```powershell
npm ci
npm run check
# 在另一个终端先运行 npm start
npm test
```

其它机器先 `npx playwright install chromium`，或设置 BROWSER_PATH 指向 chrome.exe。验证记录与逐表检查见 [TESTING.md](TESTING.md)。

## 验证边界与已知问题

- 已进行本地浏览器、PostgreSQL 内核和云端 SDK 合同测试；**没有真实 Supabase 配置，真实 PostGIS、跨连接并发、Auth 邮件、Realtime、私有 Storage 端到端验收尚未完成**。
- 本地数据库测试用 PGlite 执行真实 SQL/RLS/PLpgSQL；空间函数用替身，只验证参数和流程。SDK 合同测试模拟 HTTP 响应，不能代替真实云端验收。
- 首页 offset 分页可能在连续新增任务时产生分页漂移；规模增大后改为 keyset cursor。
- 通知显示最近 100 条，单会话最近 200 条；暂未提供历史翻页。通知总未读数独立计数。“我的接单/我发布的”暂未提供历史分页，受目标 API 行数上限影响。
- 执照上传成功但提交失败可能留下本人私有孤立对象，后续需管理员清理作业。客户端没有覆盖/删除已提交证据的权限。
- 历史商家和任务需重新审核；旧坐标与城市必须核实回填。迁移前必须备份。
- 本地演示使用 Web Locks 和 storage 事件；不支持 Web Locks 的浏览器仅保证单标签顺序，不提供多端事务。
- 任务完成允许任一参与方提交，不涉及资金；争议/双重确认留后续。固定时间与 time_text 并存，修改时间说明不自动改变固定时间。

## 下一版

先完成目标 Supabase 验收，再做国内短信、地图选点和坐标转换、历史分页、离线缓存、图片消息。支付、托管、提现、税务和 AI 模型不属于本版。
