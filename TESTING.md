# v0.5 验收与已知限制

## 实际执行环境

Windows / Node.js 22.14.0 / 本机 Chromium，390×844 移动端；PGlite 0.3.14 PostgreSQL 内核。

2026-09-10 最终运行：`npm run check` 25 个文件通过；`npm test` 17 项通过、0 失败；320/390/480/1440 宽度检查均无页面横向溢出。

先启动 `npm start`，在另一个终端运行 `npm run check` 与 `npm test`。数据库测试独立运行 `node --test tests/database.test.cjs`，不依赖 HTTP 服务。BROWSER_PATH 可以指定 Chrome 可执行文件。

## 自动化覆盖

| 文件 | 内容 | 验证边界 |
|---|---|---|
| database.test.cjs | 两份 migration、13 个子场景、RLS/RPC/容量/私有对象/评价/seed 幂等/分页 | SQL 权限和 PLpgSQL 真实执行；空间函数替身，不是 PostGIS 距离验收 |
| browser.test.cjs | 游客→收藏→登录→报名→商家确认→聊天已读→完成→双方评价→信用页→附近 | 本地 adapter 的真实浏览器流程 |
| moderation-browser.test.cjs | 新商家→选文件→独立后台认证→发布待审→审核→举报处理→审计 | 本地审核模拟器；不代表云端上传 |
| cloud-browser.test.cjs | 附带的真实 Supabase SDK 发 RPC、20 条分页、总数、防抖、3km定位、失败不降级 | HTTP 返回值为测试模拟；不代表真实 Supabase 已上线 |
| live-concurrency.cjs | 两个独立 HTTP 请求争抢最后名额，要求恰好一个成功 | **需自行提供隔离项目凭据，当前未执行** |

数据库子测试：未认证/审核/席位不能直接写；收藏和举报账户隔离；私有对象本人目录/对象存在性；组合筛选与距离合同；重复/自报名；参与方和最后名额；关闭任务读取；双向评价唯一性；私聊/已读/通知伪造；管理员和私有辅助函数隔离；审计；任务修改权限；28 条 seed 幂等及分页。

运行结果保存在 test-results；截图是本地演示，不得标作真实招聘或真实商家信用。

## 逐表 RLS 必查

| 表 | 正向 | 反向 / 预期拒绝 |
|---|---|---|
| profiles | 本人可读公开列，通过 save_my_profile 更新 | SELECT credit_code、直接写 verified、insert 自认证、读取别人私有行 |
| worker_profiles | 本人读取，RPC 更新技能/简介 | 直接改其它用户、伪造完成数；公开仅白名单 RPC |
| merchant_profiles | 本人读；真实上传后 RPC 提交 pending | 自行 verified、读他人信用代码和执照路径 |
| tasks | 游客 approved/open/有名额；owner 和订单参与人有必要读取权 | 未认证发布、前端自己审核、改 owner/名额、越权编辑 |
| applications | 自己报名、商家读自己任务报名；合法 RPC 状态转换 | 伪造 merchant_id、自报名、重复、越权接受、终态回退、超卖 |
| messages | 接受/完成的双方发文本和读取 | 第三人读写、伪造 system/sender/read_at、未接受聊天 |
| reviews | completed 双方各一次 | 未完成写入、第三方/自我评价、第二次评价、越界评分 |
| favorites | 只读写自己的记录，合并不重复 | 写其它 user_id、读他人收藏 |
| notifications | 本人读取/经 RPC 标记已读 | 给别人插入通知、直接更改标题/user_id/read_at |
| reports | 本人创建及读处理状态 | 商家读举报人信息、用户改审核结果 |
| audit_logs | 后台写入每次状态/审核事件 | 普通用户读取、增删改审计 |
| admin_users | 仅数据库管理员分配 | 注册 metadata 授权、普通用户列出/插入自己 |
| storage.objects | 本人 UUID 前缀上传和读取 | 他人目录上传、读他人执照、覆盖/删除已提交证据 |

## 云端上线前必须亲自补跑 A–H

使用独立测试项目。测试账号见 README，密码由你设置，无默认真实密码。

**A 游客：** 无痕打开，搜索设计/线上、详情、信用页、收藏，再接单才出现登录。登录后在另一浏览器看收藏；退出不会看到上一账号的收藏。

**B PostGIS：** 用已知 WGS84 点和距其 0.9/2.9/3.1/5.1km 的任务；设备授权查询 3km，只出前两条线下任务。改距离、工作方式、工资、白/晚班组合应实际体现在 RPC JSON 和 SQL 结果；核对 distance_meters，并用 EXPLAIN ANALYZE 检查 GIST（小 seed 表使用顺序扫描不等于索引无效，要在合理数据量检查）。GCJ-02 不直接当 WGS84。拒绝定位后仍能按城市浏览。

**C 报名：** 求职者直接 API 重复报名同单，第二次失败；伪造其它 worker/merchant 的直接 INSERT 被权限拒绝。取消后再报同单仍拒绝。

**D 并发：** 1 个余位、2 个不同求职者先报名，商家同时发 accept_application；只能 1 个成功，spots_left=0。运行 live-concurrency.cjs 或用两个连接事务验证阻塞；重复接受同一个报名不二次扣减。取消 accepted 归还一个名额，另一个申请才可接受。

**E 评价：** accepted→completed；双方分别评价；未完成、非参与者、重复、自我、0/6 分拒绝；商家与求职者页各自评分/完成数更新，不显示虚构百分比。

**F 认证：** 真实 JPG/PNG/PDF≤10MB 上传后桶内看到私有对象。错误类型/超限拒绝；只提交文件名不能成功；第三人下载失败。普通用户调用 Edge Function 或 admin_moderate 返回拒绝。授权管理员可拿到60秒 signed URL，认证审核后普通账号才可发布。检查已有泛化 Storage policies 是否错误地放开该桶。

**G 审核：** 新任务 pending 不在公开 feed，后台批准后出现；修改尚未确认用人的任务重新 pending；已有 accepted/completed 的任务拒绝修改。普通用户无法直接通过；每次审核 audit_logs 有前后记录。

**H 举报：** 用户创建举报、商家不能读举报详情；后台处理后本人通知更新，audit_logs 记录处理者。后台请求携带非管理员 JWT 应返回403。

**Realtime：** 两个真实浏览器会话，确认报名通知自动出现；发消息自动刷新；收件方打开会话，发送方已读标识变化。切后台恢复后重新读取，不丢输入框草稿。退出后取消前用户订阅。

## 当前不能宣称完成的验收

目标 Supabase 未提供，真实地理距离/查询计划、跨连接事务竞态、邮件、Realtime、Storage上传与 Edge Function 部署均未真实运行。本地 SQL 测试不替代这些验收。已提供 deploy、migration、seed 和 opt-in 并发测试；在隔离环境通过后才能标为正式可用。
