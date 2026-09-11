# v0.4.3 → v0.5.2 迁移

## 顺序

1. 备份数据库/Storage，在隔离副本演练；暂停旧客户端写入。
2. 新库运行根目录 supabase.sql，然后 202609100001_v050_foundation.sql、202609100002_task_edit.sql、202609100003_message_inbox.sql、202609100004_desktop_sync.sql、202609110005_service_hardening.sql。
3. 旧 v0.4.3 库依序跑五份 migration；不要重新执行旧 supabase.sql。每份迁移各自事务执行，文件不是可重复运行脚本。

## PostGIS 与旧坐标

PostGIS 必须在 extensions schema，迁移会检查。若已有其它 schema 的 PostGIS，先在副本按实际版本调整 schema 前缀/扩展配置；不要盲目 DROP CASCADE。

新线下坐标统一 WGS84，线上为 NULL。旧 lat/lng 来源未知，不自动生成 location_geog。确认数据来源与城市后，由管理员对指定记录回填：

```sql
update public.tasks
set city='广州', coordinate_system='WGS84',
 location_geog=extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography
where id='YOUR_VERIFIED_TASK_UUID' and type='offline'
 and lat between -90 and 90 and lng between -180 and 180;
```

缺城市的旧线下任务不进入该城市结果，缺 geography 的任务不进入半径结果。GCJ-02 需明确转换后入库，当前没有地图选点依赖。

## 保留与修复

- profiles 旧 role/verified/企业字段保留历史证据，但撤销客户端访问这些敏感列。新 current_mode 只代表界面身份，认证以 merchant_profiles 为准。
- worker_profiles 从已有 skills 复制。商家名称和信用代码保留，**旧认证重置为 unverified**：旧 INSERT policy 允许用户自我认证，无法直接继承信任。
- 历史任务审核/verified 先记入 audit_logs，再转为 pending/false。商家复审后，再审核任务。任务、报名、聊天正文不删除。
- price_fen=round(price*100)，旧 price 保留；RPC 写入时以整数分为准，同时维护旧金额。
- spots_left 根据总人数减 accepted/completed 重算。历史超卖触发 LEGACY_OVERBOOKED 并回滚整份迁移，必须核实旧报名，不能自动丢弃。
- unique(task_id,worker_id) 保留。取消/拒绝是终态，不能再报同单。确认和取消统一先锁任务再锁报名，避免反向锁死锁。
- 接受扣名额，零名额 closed；已接受者取消归还名额并恢复原满员任务。完成不归还名额，全部占用名额完成后任务 completed。
- 已报名者仍可读取订单关联的关闭任务；游客只看 approved+open+有名额。

## 权限与 Storage

关键状态只允许 RPC 写入；所有 SECURITY DEFINER 函数固定 search_path、显式鉴权、收回 PUBLIC 执行权。审核 RPC 仅 service_role 可执行，且再次验证 admin_users。

新增 worker_profiles、merchant_profiles、favorites、reviews、notifications、audit_logs、admin_users，全部启用 RLS。公开档案通过 get_public_profile 白名单投影，绝不返回信用代码、执照路径或审核详情。

merchant-verification 为私有桶，10MB，只允许 JPEG/PNG/PDF；用户只写本人 UUID 目录，不能覆盖或删除证据。审核员由 Edge Function 验 JWT 和管理员表后取得 60 秒 signed URL。

**目标库如已有宽泛 Storage policies，需核查是否也允许访问新桶。允许策略按 OR 合并；本迁移不擅自删除其它业务策略。**

首次管理员授权由数据库管理员执行：

```sql
insert into public.admin_users(user_id)
select id from auth.users where email='YOUR_ADMIN_EMAIL'
on conflict do nothing;
```

注册 metadata 和普通前端不能授权管理员。messages/notifications 加入 Realtime，仍受 RLS 限制。

## 回退

失败的迁移文件会回滚该文件。第一份成功、第二份失败时，只修第二份；不要重跑第一份。正式库已有 v0.5 写入后，先备份再制定反向迁移，不能直接删新表或覆盖旧 RLS。恢复旧版需要数据库与前端匹配恢复。

原版文件未改，本地演示独立 v050 数据，不迁移旧缓存身份。

## 验收门槛

按 TESTING.md 验证真实 PostGIS 边界和 GIST EXPLAIN、独立请求抢最后名额、未认证发布/自我认证/系统消息伪造被拒绝、第三人无法访问执照、管理员审核有审计、旧任务复审后可被查询。没有真实环境通过记录前不能标为生产可用。

## v0.5.0 → v0.5.1 消息列表升级

已运行前两份迁移的库，消息升级执行 `202609100003_message_inbox.sql`，随后本次 PC 升级再执行 `004`。新增只读 RPC `get_message_inbox(p_query)`，只向报名参与方返回对方公开名称/头像、任务摘要、最新消息、真实未读总数；匿名不可调用。没有删除、更改历史业务数据和权限状态机。
本地 LocalStorage 键保持不变，不清空原消息。会话按接单记录区分，同一对象不同任务各有一条会话，便于追踪约定。通知页排除重复的聊天通知。

## v0.5.1 PC 响应式与一致性补充

已完成前三份迁移的库只追加 `202609100004_desktop_sync.sql`：

- search_tasks_v051 使用与原查询相同的公开任务条件，增加 min_price_fen、max_price_fen、price_unit_filter。先过滤，再计数与分页。原 RPC 保持可用。
- 商家认证 trigger 同步 tasks.verified，并校正已有记录。任务审核和商家认证仍是两个不同状态；不自动审批任务。
- 不创建任何业务表、不修改原 RLS。普通用户无权调用 trigger 函数；搜索仅公开审核通过且可报名的任务。
- 本地 PGlite 已执行验证；目标 Supabase 尚未执行。上线前备份，在隔离项目补做八项跨设备、Storage、Auth、Realtime 验收。

## v0.5.1 → v0.5.2 服务加固

已运行001–004的库只追加 `202609110005_service_hardening.sql`，先执行迁移再更新前端。

- 新增 get_conversation_messages，只允许当前报名的参与者读取；匿名和第三人拒绝。
- 以 created_at + id 双字段游标翻页，单页最大200条；即使时间戳相同也不重复、不跳过。
- 新增 messages(application_id, created_at desc, id desc) 索引。
- 不新建业务表、不修改历史数据、不改变原有消息/通知/报名RPC。旧客户端仍可运行。
- 回退时先恢复旧客户端；可保留未使用的新函数/索引，无需删除业务数据。
- 此迁移非幂等脚本，请只运行一次；本地SQL权限测试通过不代表已部署至真实项目。
