# 活搭 HUODA 5.4 Supabase 部署报告

日期：2026-09-12
项目：huoda
Project Ref：`qzhlyuqwsmpirofwjxko`

## 迁移与安全检查

- 项目级 Supabase CLI：2.117.0。
- 根目录 `supabase.sql` 与 `202609090000_base_schema.sql` 内容一致；前者仅供人工审阅，不另行执行。
- 正式顺序：基础迁移 → 001 → 002 → 003 → 004 → 005 → 006。
- `npm run check:migrations` 检查 7 个事务、12 张表、27 个历史 policy 名称和 34 个 function 名称，通过。
- 首次远程 dry-run 只列出上述 7 个文件；迁移完成后的 dry-run 返回 `Remote database is up to date`。
- `seed.sql` 未部署。

## 已部署表

`profiles`、`worker_profiles`、`merchant_profiles`、`tasks`、`applications`、`messages`、`reports`、`favorites`、`reviews`、`notifications`、`audit_logs`、`admin_users`。

远程 `table-stats` 已返回全部 12 张表；当前均为空表，未写入演示数据。

## RLS 与最终 policy

12 张 public 表均启用 RLS。`audit_logs` 与 `admin_users` 对普通客户端没有允许 policy，默认拒绝。

最终 public policy：

- profiles：`own_profile_read`
- worker_profiles：`own_worker_read`
- merchant_profiles：`own_merchant_read`
- tasks：`task_read`
- applications：`application_read`
- messages：`message_read`
- reports：`report_read`
- favorites：`favorite_read`、`favorite_add`、`favorite_delete`
- notifications：`notification_read`
- reviews：`review_participant_read`

Storage policy：`huoda_license_insert`、`huoda_license_read`。`merchant-verification` 桶已创建为私有桶，限制 10MB，仅允许 JPG、PNG、PDF，客户端没有 UPDATE/DELETE policy。

真实匿名访问验证：公开 `tasks` 查询返回 200；`profiles`、`applications`、`messages`、`reports` 均返回 401 / PostgreSQL `42501`。

## 已部署数据库 function

`accept_application`、`admin_moderate`、`apply_to_task`、`apply_to_task_v054`、`close_open_applications_v054`、`create_task`、`create_task_v054`、`edit_task_details`、`edit_task_v054`、`get_conversation_messages`、`get_message_inbox`、`get_public_profile`、`handle_new_user`、`huoda_audit`、`huoda_notify`、`is_task_participant`、`mark_conversation_read`、`mark_notification_read`、`protect_profile_verification`、`protect_task_review`、`save_my_profile`、`search_nearby_tasks`、`search_tasks_v051`、`search_tasks_v054`、`send_text_message`、`send_text_message_v054`、`submit_merchant_verification`、`submit_report`、`submit_review`、`sync_merchant_task_badges`、`transition_application`、`transition_application_v054`、`transition_task_v054`、`validate_application_transition`。

游客实际调用 `search_tasks_v054` 返回 200，当前结果为 0 条，因为生产库未运行 seed。

## Edge Function

`admin-review` 已部署，状态 `ACTIVE`，版本 1，`verify_jwt=true`。当前允许本地开发来源 `http://127.0.0.1:8085` 与 `http://localhost:8085`；Vercel 发布后必须追加正式 HTTPS Origin。

实际检查：OPTIONS 预检返回 204 且来源正确；未登录 POST 返回 401。

## 错误与剩余验收

数据库迁移和 Edge Function 部署没有报错。远程 schema dump 因本机未安装 Docker 无法运行；已改用远程 migration history、table/index stats、真实 REST/RPC/RLS 请求和函数列表完成复核，没有为此安装 Docker。

本机 `config.js` 已写入 Project URL 与 Publishable Key，并由 Git 忽略。没有把数据库密码、Access Token、Secret Key 或 Service Role Key 写入项目源码、GitHub 或 Vercel。

仍需在 Vercel 发布后完成真实双账号注册、报名全状态、Realtime 消息、执照上传、管理员审核、评价、举报和最后名额并发验收。
