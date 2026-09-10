-- 活搭 HUODA MVP v0.3 / Supabase 初始化与升级脚本
-- 可用于全新项目，也可在 v0.2 数据库上执行升级。
-- 在 Supabase Dashboard -> SQL Editor 中执行。

create extension if not exists pgcrypto;

-- 1) 用户资料
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '新用户',
  role text not null default 'worker' check (role in ('worker','merchant')),
  city text not null default '广州',
  skills text[] not null default '{}',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists verification_status text not null default 'unverified';
alter table public.profiles add column if not exists company_name text not null default '';
alter table public.profiles add column if not exists credit_code text not null default '';
alter table public.profiles add column if not exists license_file_name text not null default '';

-- 2) 兼职 / 技能任务
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('online','offline')),
  title text not null,
  price numeric(10,2) not null check (price > 0),
  price_unit text not null default '次',
  pay_mode text not null default '日结',
  settlement text not null,
  time_text text not null,
  location text not null,
  tags text[] not null default '{}',
  company_name text not null default '认证商家',
  description text not null,
  spots_total integer not null default 1 check (spots_total > 0),
  spots_left integer not null default 1 check (spots_left >= 0),
  status text not null default 'open' check (status in ('open','closed','paused')),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists category text not null default '兼职';
alter table public.tasks add column if not exists lat double precision;
alter table public.tasks add column if not exists lng double precision;
alter table public.tasks add column if not exists review_status text not null default 'pending';
alter table public.tasks add column if not exists risk_level text not null default 'low';

-- 如果这是从 v0.2 升级，旧任务在新增 review_status 后会采用 pending。
-- 确认旧任务可信后，可由管理员一次性手动将需要保留的旧任务改为 approved；
-- 本脚本不自动批准，避免重复执行脚本时误放行真实待审核任务。

-- 3) 报名 / 接单
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied','accepted','rejected','completed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(task_id, worker_id)
);

-- 4) 站内聊天
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_application_idx on public.messages(application_id, created_at);

-- 5) 任务举报
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  reason text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists reports_task_idx on public.reports(task_id, created_at desc);

-- 6) 防止普通前端用户把自己的认证状态直接改成 verified。
create or replace function public.protect_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and old.verification_status is distinct from new.verification_status
     and new.verification_status not in ('unverified','pending') then
    raise exception 'verification status can only be approved by admin';
  end if;
  new.verified := (new.verification_status = 'verified');
  return new;
end;
$$;

drop trigger if exists protect_profile_verification_trigger on public.profiles;
create trigger protect_profile_verification_trigger
before update on public.profiles
for each row execute procedure public.protect_profile_verification();

-- 7) 防止商家自己把任务审核状态改成 approved。
create or replace function public.protect_task_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if old.review_status is distinct from new.review_status then
      raise exception 'review status can only be changed by admin';
    end if;
    if old.risk_level is distinct from new.risk_level then
      raise exception 'risk level can only be changed by admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_task_review_trigger on public.tasks;
create trigger protect_task_review_trigger
before update on public.tasks
for each row execute procedure public.protect_task_review();

-- 8) 约束报名状态流转。
create or replace function public.validate_application_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = new.status then return new; end if;
  if old.status='applied' and new.status in ('accepted','rejected','cancelled') then return new; end if;
  if old.status='accepted' and new.status in ('completed','cancelled') then return new; end if;
  raise exception 'invalid application status transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists validate_application_transition_trigger on public.applications;
create trigger validate_application_transition_trigger
before update on public.applications
for each row execute procedure public.validate_application_transition();

-- 9) 开启 RLS
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.applications enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- profiles policies
drop policy if exists "profiles readable by authenticated users" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid()=id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);

-- tasks policies
drop policy if exists "open tasks readable by everyone" on public.tasks;
drop policy if exists "authenticated users create tasks" on public.tasks;
drop policy if exists "owners update tasks" on public.tasks;
drop policy if exists "approved tasks readable" on public.tasks;
drop policy if exists "verified merchants create pending tasks" on public.tasks;
create policy "approved tasks readable" on public.tasks
for select to anon, authenticated
using ((status='open' and review_status='approved') or owner_id=auth.uid());
create policy "verified merchants create pending tasks" on public.tasks
for insert to authenticated
with check (
  auth.uid()=owner_id
  and review_status='pending'
  and exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='merchant' and p.verification_status='verified'
  )
);
create policy "owners update tasks" on public.tasks
for update to authenticated using (auth.uid()=owner_id) with check (auth.uid()=owner_id);

-- applications policies
drop policy if exists "participants read applications" on public.applications;
drop policy if exists "workers create applications" on public.applications;
drop policy if exists "participants update applications" on public.applications;
drop policy if exists "workers update own applications" on public.applications;
drop policy if exists "merchants update applications" on public.applications;
create policy "participants read applications" on public.applications
for select to authenticated using (auth.uid()=worker_id or auth.uid()=merchant_id);
create policy "workers create applications" on public.applications
for insert to authenticated with check (
  auth.uid()=worker_id
  and worker_id<>merchant_id
  and exists (select 1 from public.tasks t where t.id=task_id and t.status='open' and t.review_status='approved')
);
create policy "workers update own applications" on public.applications
for update to authenticated using (auth.uid()=worker_id)
with check (auth.uid()=worker_id and status in ('cancelled','completed'));
create policy "merchants update applications" on public.applications
for update to authenticated using (auth.uid()=merchant_id)
with check (auth.uid()=merchant_id and status in ('accepted','rejected'));

-- messages policies
drop policy if exists "participants read messages" on public.messages;
drop policy if exists "participants send messages" on public.messages;
create policy "participants read messages" on public.messages
for select to authenticated using (
  exists (select 1 from public.applications a where a.id=application_id and (a.worker_id=auth.uid() or a.merchant_id=auth.uid()))
);
create policy "participants send messages" on public.messages
for insert to authenticated with check (
  sender_id=auth.uid()
  and exists (select 1 from public.applications a where a.id=application_id and a.status in ('accepted','completed') and (a.worker_id=auth.uid() or a.merchant_id=auth.uid()))
);

-- reports policies
drop policy if exists "users create reports" on public.reports;
drop policy if exists "users read own reports" on public.reports;
create policy "users create reports" on public.reports
for insert to authenticated with check (reporter_id=auth.uid());
create policy "users read own reports" on public.reports
for select to authenticated using (reporter_id=auth.uid());

-- 10) 注册后自动创建 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id,name,role,city,verification_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'新用户'),
    coalesce(new.raw_user_meta_data->>'role','worker'),
    '广州',
    'unverified'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 云端管理员审核说明：
-- 真实后台应使用受保护的服务端 / Edge Function + service_role 完成以下动作：
-- update profiles set verification_status='verified' where id='...';
-- update tasks set review_status='approved' where id='...';
-- update reports set status='resolved' where id='...';
-- service_role 绝不能写入 config.js 或任何公开前端代码。
