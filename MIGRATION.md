# 活搭 HUODA 5.4 数据库迁移

## 适用版本

本说明用于将新库或已完成 5.3（001–005）的数据库升级到 5.4。迁移前必须备份数据库和 Storage，并暂停旧客户端写入。迁移文件以事务执行，但不是可随意重复运行的初始化脚本。

## 全新 Supabase 项目

在 SQL Editor 严格按顺序执行：

1. supabase.sql
2. supabase/migrations/202609100001_v050_foundation.sql
3. supabase/migrations/202609100002_task_edit.sql
4. supabase/migrations/202609100003_message_inbox.sql
5. supabase/migrations/202609100004_desktop_sync.sql
6. supabase/migrations/202609110005_service_hardening.sql
7. supabase/migrations/202609120006_v054_cloud_lifecycle.sql

supabase/seed.sql 只供隔离测试项目使用，生产库禁止执行。

## 已运行 5.3 的项目

确认迁移记录中已经完成 001–005 后，只执行 202609120006_v054_cloud_lifecycle.sql。不要重新运行 supabase.sql，它包含早期基线权限，重复覆盖会破坏最终 RLS/RPC 边界。

## 006 做了什么

- 将旧任务状态映射为六态：
  - open + pending → pending_review
  - open + approved + 有名额 → recruiting
  - open/closed + 无名额 → full
  - closed/paused/completed → ended
  - open + rejected → taken_down
- 固化任务约束：draft、pending_review、recruiting、full、ended、taken_down。
- 固化报名约束：applied、viewed、communicating、accepted、rejected、completed、cancelled。
- 增加 updated_at、任务结束/下架时间和报名完成操作者。
- 新增 5.4 搜索、创建草稿、提交审核、任务流转、报名流转和消息 RPC。
- 录用时锁定任务行并原子扣减名额；已录用者取消时在仍可招聘的条件下归还名额。
- 任务结束、商家下架或审核拒绝时，将未决报名关闭为 rejected 并写通知、系统消息和审计。
- 完成后的聊天只读；评价仍由既有 submit_review 保证双方各一次。
- 游客只读取审核通过、招聘中、有名额且未过期的任务；草稿和非公开状态只对所有者/参与者可见。
- Realtime publication 增加 merchant_profiles、tasks、applications；消息和通知沿用既有配置。
- Reviews 的原始关系 ID 不再公开，公开信用页继续通过白名单 RPC 返回聚合结果。

## 管理员与 Edge Function

先在 Authentication 创建管理员账号，再由数据库管理员在 SQL Editor 执行：

    insert into public.admin_users(user_id)
    select id from auth.users where email='YOUR_ADMIN_EMAIL'
    on conflict do nothing;

部署审核函数：

    supabase login
    supabase link --project-ref YOUR_PROJECT_REF
    supabase secrets set ADMIN_ALLOWED_ORIGINS=https://YOUR_VERCEL_DOMAIN
    supabase functions deploy admin-review

不要把浏览器以外的高权限 key 写入前端、GitHub 或 Vercel。Supabase Edge Function 运行环境提供服务端变量。

## Auth、Storage 与 Realtime

- merchant-verification 是私有桶，10MB，只允许 JPG/PNG/PDF；文件路径以本人 UUID 开头。
- 用户不能覆盖或删除已提交的审核证据；审核后台只取得 60 秒 signed URL。
- 检查项目中是否存在其它宽泛 Storage policy。Supabase 的多条允许策略会按 OR 合并。
- Realtime 事件只作为刷新信号，业务页面通过 Service 重读 RLS 保护后的权威数据。
- Auth Site URL 与 Redirect URLs 必须包含本地地址和最终 Vercel HTTPS 域名。

## 迁移后检查

在 SQL Editor 确认：

    select conname, pg_get_constraintdef(oid)
    from pg_constraint
    where conname in ('tasks_status_check','applications_status_check');

    select status, count(*) from public.tasks group by status order by status;
    select status, count(*) from public.applications group by status order by status;

    select routine_name
    from information_schema.routines
    where routine_schema='public'
      and routine_name like '%v054%'
    order by routine_name;

随后按 TESTING.md 在真实手机/电脑完成 Auth、Database、Realtime、Storage、Edge Function 与并发名额验收。

## 回退原则

006 失败会回滚该文件。若已成功迁移并产生 5.4 数据，不要直接删除新列、放宽约束或恢复旧前端；先备份，再制定与数据状态匹配的反向迁移。应用层可从 Git tag v5.3-stable 查看旧代码，但数据库与前端必须成套回退。
