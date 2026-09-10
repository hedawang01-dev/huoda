-- Apply once after the v0.4.3 baseline. Existing records are preserved.
begin;
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
do $$ begin
  if (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis') <> 'extensions' then
    raise exception 'PostGIS must be in extensions; follow MIGRATION.md before running';
  end if;
end $$;
alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.profiles add column if not exists current_mode text not null default 'worker' check(current_mode in ('worker','merchant'));
update public.profiles set current_mode=role;
create table public.worker_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 bio text not null default '' check(length(bio)<=1000), skills text[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.merchant_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 company_name text not null default '', credit_code text not null default '',
 verification_status text not null default 'unverified' check(verification_status in ('unverified','pending','verified','rejected')),
 license_storage_path text, verified_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.worker_profiles(user_id,skills) select id,skills from public.profiles;
-- Legacy verification is intentionally reset: old INSERT policy allowed self-verification.
insert into public.merchant_profiles(user_id,company_name,credit_code)
 select id,company_name,credit_code from public.profiles where role='merchant' or company_name<>'';
alter table public.tasks add column if not exists price_fen bigint;
update public.tasks set price_fen=round(price*100)::bigint;
alter table public.tasks alter column price_fen set not null;
alter table public.tasks add constraint tasks_price_fen_check check(price_fen>0 and price_fen<=100000000);
alter table public.tasks add column if not exists start_at timestamptz;
alter table public.tasks add column if not exists end_at timestamptz;
alter table public.tasks add column if not exists schedule_type text not null default 'flexible' check(schedule_type in ('flexible','fixed','deadline'));
alter table public.tasks add column if not exists shift text not null default '';
alter table public.tasks add column if not exists city text not null default '';
alter table public.tasks add column if not exists coordinate_system text check(coordinate_system='WGS84');
alter table public.tasks add column if not exists location_geog extensions.geography(Point,4326);
alter table public.tasks add constraint tasks_schedule_check check(end_at is null or start_at is null or end_at>start_at);
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check(status in ('open','paused','closed','completed'));
alter table public.tasks add constraint tasks_review_check check(review_status in ('pending','approved','rejected'));
-- Reconcile legacy accepted/completed seats. Do not silently discard overbooked applications.
do $$ begin
 if exists(select 1 from public.tasks t where t.spots_total < (select count(*) from public.applications a where a.task_id=t.id and a.status in ('accepted','completed'))) then
 raise exception 'LEGACY_OVERBOOKED: reconcile existing applications before migration'; end if;
end $$;
update public.tasks t set spots_left=t.spots_total-(select count(*)::int from public.applications a where a.task_id=t.id and a.status in ('accepted','completed'));
update public.tasks set status='closed' where spots_left=0 and status='open';
alter table public.tasks add constraint tasks_capacity_check check(spots_left<=spots_total);
alter table public.messages add column if not exists message_type text not null default 'text' check(message_type in ('text','system','image'));
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists attachment_path text;
create table public.favorites (
 user_id uuid not null references public.profiles(id) on delete cascade,
 task_id uuid not null references public.tasks(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,task_id)
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
 reviewer_id uuid not null references public.profiles(id), reviewee_id uuid not null references public.profiles(id),
 rating integer not null check(rating between 1 and 5), tags text[] not null default '{}',
 comment text not null default '' check(length(comment)<=1000), created_at timestamptz not null default now(),
 unique(application_id,reviewer_id), check(reviewer_id<>reviewee_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 type text not null, title text not null, body text not null default '', data jsonb not null default '{}',
 read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null,
 target_type text not null, target_id uuid not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table public.admin_users(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
-- Save previous public state before requiring a trustworthy re-review of legacy tasks.
insert into public.audit_logs(action,target_type,target_id,before_data,after_data)
 select 'v050_legacy_recheck','task',id,jsonb_build_object('review_status',review_status,'verified',verified),jsonb_build_object('review_status','pending','verified',false) from public.tasks;
update public.tasks set review_status='pending',verified=false;
create index tasks_geog_idx on public.tasks using gist(location_geog);
create index tasks_feed_idx on public.tasks(review_status,status,created_at desc,id);
create index tasks_owner_idx on public.tasks(owner_id,created_at desc);
create index tasks_filters_idx on public.tasks(city,type,pay_mode,shift);
create index applications_task_status_idx on public.applications(task_id,status);
create index applications_worker_created_idx on public.applications(worker_id,created_at desc);
create index notifications_unread_idx on public.notifications(user_id,read_at,created_at desc);
create index reviews_reviewee_idx on public.reviews(reviewee_id,created_at desc);
create index reports_status_idx on public.reports(task_id,status,created_at desc);
create index messages_unread_idx on public.messages(application_id,read_at,created_at desc);

-- Remove old policies, grants and mutable verification triggers before establishing new boundaries.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('profiles','tasks','applications','messages','reports') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
end $$;
drop trigger if exists protect_profile_verification_trigger on public.profiles;
drop trigger if exists protect_task_review_trigger on public.tasks;
revoke all on public.profiles,public.tasks,public.applications,public.messages,public.reports,public.worker_profiles,public.merchant_profiles,public.favorites,public.reviews,public.notifications,public.audit_logs,public.admin_users from anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['worker_profiles','merchant_profiles','favorites','reviews','notifications','audit_logs','admin_users'] loop execute format('alter table public.%I enable row level security',t);end loop;
end $$;
grant select(id,name,city,skills,avatar_url,current_mode,created_at) on public.profiles to authenticated;
create policy own_profile_read on public.profiles for select to authenticated using(id=auth.uid());
grant select on public.worker_profiles,public.merchant_profiles to authenticated;
create policy own_worker_read on public.worker_profiles for select to authenticated using(user_id=auth.uid());
create policy own_merchant_read on public.merchant_profiles for select to authenticated using(user_id=auth.uid());
create or replace function public.is_task_participant(p_task uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.applications where task_id=p_task and worker_id=auth.uid())
$$;
grant select on public.tasks to anon,authenticated;
create policy task_read on public.tasks for select to anon,authenticated using(
 (review_status='approved' and status='open' and spots_left>0) or owner_id=auth.uid() or public.is_task_participant(id));
grant select on public.applications to authenticated;
create policy application_read on public.applications for select to authenticated using(auth.uid() in (worker_id,merchant_id));
grant select on public.messages to authenticated;
create policy message_read on public.messages for select to authenticated using(exists(select 1 from public.applications a where a.id=application_id and auth.uid() in (a.worker_id,a.merchant_id)));
grant select on public.reports to authenticated;
create policy report_read on public.reports for select to authenticated using(reporter_id=auth.uid());
grant select,insert,delete on public.favorites to authenticated;
create policy favorite_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorite_add on public.favorites for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and t.status='open' and t.review_status='approved'));
create policy favorite_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
grant select on public.notifications to authenticated;
create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid());
grant select on public.reviews to anon,authenticated;
create policy review_read on public.reviews for select to anon,authenticated using(true);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.profiles(id,name,role,current_mode,city) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'name',''),'新用户'),60),'worker','worker','广州') on conflict do nothing;
 insert into public.worker_profiles(user_id) values(new.id) on conflict do nothing;
 return new;
end $$;

create function public.huoda_notify(p_user uuid,p_type text,p_title text,p_body text,p_data jsonb) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.notifications(user_id,type,title,body,data) values(p_user,p_type,p_title,p_body,p_data)
$$;
create function public.huoda_audit(p_actor uuid,p_action text,p_kind text,p_target uuid,p_before jsonb,p_after jsonb) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.audit_logs(actor_id,action,target_type,target_id,before_data,after_data) values(p_actor,p_action,p_kind,p_target,p_before,p_after)
$$;

create function public.save_my_profile(p_name text,p_city text,p_mode text,p_skills text[],p_bio text default '',p_avatar text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 60 or p_city is null or length(p_city) not between 1 and 60 or p_mode is null or p_mode not in ('worker','merchant') or p_skills is null or cardinality(p_skills)>8 or length(coalesce(p_bio,''))>1000 or (coalesce(p_avatar,'')<>'' and p_avatar !~ '^https://') then raise exception 'INVALID_PROFILE';end if;
 update public.profiles set name=trim(p_name),city=p_city,current_mode=p_mode,skills=p_skills,avatar_url=coalesce(p_avatar,'') where id=auth.uid();
 insert into public.worker_profiles(user_id,skills,bio) values(auth.uid(),p_skills,coalesce(p_bio,'')) on conflict(user_id) do update set skills=excluded.skills,bio=excluded.bio,updated_at=now();
end $$;

create function public.search_nearby_tasks(user_lat double precision default null,user_lng double precision default null,radius_km double precision default null,city text default null,work_type text default null,pay_mode text default null,shift text default null,sort_mode text default 'recommend',page_limit integer default 20,page_cursor integer default 0,keyword text default '') returns jsonb language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare origin extensions.geography; result jsonb; begin
 if (user_lat is null)<>(user_lng is null) or user_lat not between -90 and 90 or user_lng not between -180 and 180 or radius_km not between 0.1 and 10 or page_limit is null or page_limit not between 1 and 50 or page_cursor is null or page_cursor<0 or length(coalesce(keyword,''))>100 or sort_mode is null or sort_mode not in ('recommend','distance','price','newest') then raise exception 'INVALID_SEARCH';end if;
 if user_lat is not null then origin=extensions.st_setsrid(extensions.st_makepoint(user_lng,user_lat),4326)::extensions.geography;end if;
 if (radius_km is not null or sort_mode='distance') and origin is null then raise exception 'LOCATION_REQUIRED';end if;
 with matching as (
 select t.*,case when origin is not null and t.type='offline' then extensions.st_distance(t.location_geog,origin) end distance_meters,
 ((case when exists(select 1 from public.worker_profiles w where w.user_id=auth.uid() and w.skills && t.tags) then 40 else 0 end)
 +case when origin is not null and t.type='offline' and extensions.st_dwithin(t.location_geog,origin,3000) then 20 else 0 end
 +case when t.created_at>now()-interval '7 days' then 5 else 0 end) recommendation_score
 from public.tasks t where t.review_status='approved' and t.status='open' and t.spots_left>0
 and (search_nearby_tasks.city is null or t.type='online' or t.city=search_nearby_tasks.city)
 and (work_type is null or t.type=work_type) and (search_nearby_tasks.pay_mode is null or t.pay_mode=search_nearby_tasks.pay_mode)
 and (search_nearby_tasks.shift is null or t.shift=search_nearby_tasks.shift or search_nearby_tasks.shift=any(t.tags))
 and (coalesce(keyword,'')='' or strpos(lower(concat_ws(' ',t.title,t.category,t.location,t.company_name,t.description,array_to_string(t.tags,' '))),lower(keyword))>0)
 and (radius_km is null or (t.type='offline' and extensions.st_dwithin(t.location_geog,origin,radius_km*1000)))
 ), paged as (
 select * from matching order by
 case when sort_mode='distance' then distance_meters end asc nulls last,
 case when sort_mode='price' then price_fen end desc,
 case when sort_mode='recommend' then recommendation_score end desc,
 created_at desc,id limit page_limit offset page_cursor
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'location_geog') from paged p),'[]'::jsonb),'total',(select count(*) from matching),'next_cursor',case when page_cursor+page_limit<(select count(*) from matching) then page_cursor+page_limit else null end) into result;
 return result;
end $$;

create function public.apply_to_task(p_task_id uuid) returns public.applications language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks; a public.applications; begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into t from public.tasks where id=p_task_id for update;
 if not found then raise exception 'TASK_NOT_FOUND';end if;
 if t.owner_id=auth.uid() then raise exception 'SELF_APPLICATION';end if;
 if exists(select 1 from public.applications where task_id=t.id and worker_id=auth.uid()) then raise exception 'DUPLICATE_APPLICATION';end if;
 if t.status<>'open' or t.review_status<>'approved' or t.spots_left<=0 then raise exception 'TASK_UNAVAILABLE';end if;
 insert into public.applications(task_id,worker_id,merchant_id) values(t.id,auth.uid(),t.owner_id) returning * into a;
 perform public.huoda_notify(auth.uid(),'applied','报名成功',t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 perform public.huoda_notify(t.owner_id,'applied','收到新报名',t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 perform public.huoda_audit(auth.uid(),'applied','application',a.id,null,to_jsonb(a));return a;
end $$;

create function public.transition_application(p_application_id uuid,p_status text) returns public.applications language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks; a public.applications; old_a jsonb; task_key uuid; title_text text; begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select task_id into task_key from public.applications where id=p_application_id and auth.uid() in(worker_id,merchant_id);
 if not found then raise exception 'FORBIDDEN';end if;
 -- Always task -> application, including cancellation: no reversed lock order.
 select * into t from public.tasks where id=task_key for update;
 select * into a from public.applications where id=p_application_id for update;old_a=to_jsonb(a);
 if p_status='accepted' then
  if auth.uid()<>t.owner_id then raise exception 'FORBIDDEN';end if;
  if a.status<>'applied' then raise exception 'INVALID_TRANSITION';end if;
  if t.spots_left<=0 or t.status<>'open' or t.review_status<>'approved' then raise exception 'TASK_UNAVAILABLE';end if;
  update public.tasks set spots_left=spots_left-1,status=case when spots_left=1 then 'closed' else status end where id=t.id;
  title_text='商家已确认你的报名';
 elsif p_status='rejected' then
  if auth.uid()<>t.owner_id then raise exception 'FORBIDDEN';end if;
  if a.status<>'applied' then raise exception 'INVALID_TRANSITION';end if;title_text='商家未接受此次报名';
 elsif p_status='cancelled' then
  if auth.uid()<>a.worker_id then raise exception 'FORBIDDEN';end if;
  if a.status not in ('applied','accepted') then raise exception 'INVALID_TRANSITION';end if;
  if a.status='accepted' then update public.tasks set spots_left=spots_left+1,status=case when status='closed' and spots_left=0 then 'open' else status end where id=t.id;end if;
  title_text='求职者已撤回报名';
 elsif p_status='completed' then
  if a.status<>'accepted' then raise exception 'INVALID_TRANSITION';end if;title_text='任务已完成，可以评价合作体验';
 else raise exception 'INVALID_TRANSITION';end if;
 update public.applications set status=p_status,completed_at=case when p_status='completed' then now() else null end where id=a.id returning * into a;
 if p_status='completed' and t.spots_left=0 and not exists(select 1 from public.applications where task_id=t.id and status='accepted') then update public.tasks set status='completed' where id=t.id;end if;
 perform public.huoda_notify(a.worker_id,p_status,title_text,t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 perform public.huoda_notify(a.merchant_id,p_status,title_text,t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 insert into public.messages(application_id,sender_id,content,message_type) values(a.id,auth.uid(),title_text,'system');
 perform public.huoda_audit(auth.uid(),p_status,'application',a.id,old_a,to_jsonb(a));return a;
end $$;
create function public.accept_application(p_application_id uuid) returns public.applications language sql security definer set search_path=public,pg_temp as $$select public.transition_application(p_application_id,'accepted')$$;

create function public.submit_review(p_application_id uuid,p_rating integer,p_tags text[] default '{}',p_comment text default '') returns public.reviews language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.applications; r public.reviews;other_id uuid;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into a from public.applications where id=p_application_id and auth.uid() in(worker_id,merchant_id) for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if a.status<>'completed' then raise exception 'REVIEW_REQUIRES_COMPLETION';end if;
 if p_rating is null or p_rating not between 1 and 5 or cardinality(p_tags)>8 or length(p_comment)>1000 then raise exception 'INVALID_REVIEW';end if;
 if exists(select 1 from public.reviews where application_id=a.id and reviewer_id=auth.uid()) then raise exception 'DUPLICATE_REVIEW';end if;
 other_id=case when auth.uid()=a.worker_id then a.merchant_id else a.worker_id end;
 insert into public.reviews(application_id,reviewer_id,reviewee_id,rating,tags,comment) values(a.id,auth.uid(),other_id,p_rating,coalesce(p_tags,'{}'),coalesce(p_comment,'')) returning * into r;
 perform public.huoda_audit(auth.uid(),'reviewed','review',r.id,null,to_jsonb(r));return r;
end $$;

create function public.send_text_message(p_application_id uuid,p_content text) returns public.messages language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.applications;m public.messages;other_id uuid;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into a from public.applications where id=p_application_id and auth.uid() in(worker_id,merchant_id) for share;
 if not found or a.status not in ('accepted','completed') then raise exception 'CHAT_UNAVAILABLE';end if;
 if p_content is null or length(trim(p_content)) not between 1 and 2000 then raise exception 'INVALID_MESSAGE';end if;
 insert into public.messages(application_id,sender_id,content) values(a.id,auth.uid(),trim(p_content)) returning * into m;
 other_id=case when auth.uid()=a.worker_id then a.merchant_id else a.worker_id end;
 perform public.huoda_notify(other_id,'message','收到新消息',left(trim(p_content),80),jsonb_build_object('application_id',a.id,'message_id',m.id));return m;
end $$;
create function public.mark_conversation_read(p_application_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.applications where id=p_application_id and auth.uid() in(worker_id,merchant_id)) then raise exception 'FORBIDDEN';end if;
 update public.messages set read_at=now() where application_id=p_application_id and sender_id<>auth.uid() and read_at is null;
 update public.notifications set read_at=now() where user_id=auth.uid() and type='message' and data->>'application_id'=p_application_id::text and read_at is null;
end $$;
create function public.mark_notification_read(p_notification_id uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_notification_id is null or id=p_notification_id);
end $$;

create function public.get_public_profile(p_user_id uuid,p_kind text default 'worker') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if p_kind is null or p_kind not in ('worker','merchant') then raise exception 'INVALID_PROFILE_KIND';end if;
 select jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'avatar_url',p.avatar_url,'bio',coalesce(w.bio,''),'skills',coalesce(w.skills,'{}'),
 'company_name',m.company_name,'verification_status',coalesce(m.verification_status,'unverified'),'verified_at',m.verified_at,
 'published_count',(select count(*) from public.tasks where owner_id=p.id and review_status='approved'),
 'completed_count',(select count(*) from public.applications where status='completed' and (case when p_kind='worker' then worker_id else merchant_id end)=p.id),
 'rating_avg',(select round(avg(r.rating),1) from public.reviews r join public.applications a on a.id=r.application_id where r.reviewee_id=p.id and (case when p_kind='worker' then a.worker_id else a.merchant_id end)=p.id),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r)) from (select r.rating,r.tags,r.comment,r.created_at from public.reviews r join public.applications a on a.id=r.application_id where r.reviewee_id=p.id and (case when p_kind='worker' then a.worker_id else a.merchant_id end)=p.id order by r.created_at desc limit 50) r),'[]'::jsonb)) into result
 from public.profiles p left join public.worker_profiles w on w.user_id=p.id left join public.merchant_profiles m on m.user_id=p.id where p.id=p_user_id;
 return result;
end $$;

create function public.create_task(p_task jsonb) returns public.tasks language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m public.merchant_profiles;t public.tasks;fen bigint;spots integer;lat double precision;lng double precision;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into m from public.merchant_profiles where user_id=auth.uid() for share;
 if not found or m.verification_status<>'verified' then raise exception 'MERCHANT_NOT_VERIFIED';end if;
 fen=(p_task->>'price_fen')::bigint;spots=(p_task->>'spots_total')::integer;
 if fen is null or fen not between 1 and 100000000 or spots is null or spots not between 1 and 1000 or coalesce(length(trim(p_task->>'title')),0) not between 1 and 120 or coalesce(length(p_task->>'description'),0) not between 1 and 10000 or coalesce(length(p_task->>'time_text'),0) not between 1 and 200 or coalesce(length(p_task->>'location'),0) not between 1 and 200 or (p_task->>'pay_mode') not in ('日结','周结','月结','完工结') then raise exception 'INVALID_TASK';end if;
 if p_task->>'type'='offline' then
  lat=(p_task->>'lat')::double precision;lng=(p_task->>'lng')::double precision;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 or p_task->>'coordinate_system' is distinct from 'WGS84' or coalesce(p_task->>'city','')='' then raise exception 'WGS84_LOCATION_REQUIRED';end if;
 end if;
 insert into public.tasks(owner_id,type,title,price,price_fen,price_unit,pay_mode,settlement,time_text,location,tags,company_name,description,spots_total,spots_left,verified,review_status,city,category,shift,lat,lng,coordinate_system,location_geog,start_at,end_at,schedule_type)
 values(auth.uid(),p_task->>'type',trim(p_task->>'title'),fen/100.0,fen,coalesce(p_task->>'price_unit','次'),p_task->>'pay_mode',p_task->>'settlement',p_task->>'time_text',p_task->>'location',array(select jsonb_array_elements_text(coalesce(p_task->'tags','[]'))),m.company_name,p_task->>'description',spots,spots,true,'pending',coalesce(p_task->>'city',''),coalesce(p_task->>'category','兼职'),coalesce(p_task->>'shift',''),lat,lng,case when lat is not null then 'WGS84' end,case when lat is not null then extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography end,(p_task->>'start_at')::timestamptz,(p_task->>'end_at')::timestamptz,coalesce(p_task->>'schedule_type','flexible')) returning * into t;
 perform public.huoda_audit(auth.uid(),'created','task',t.id,null,to_jsonb(t));return t;
end $$;

create function public.submit_merchant_verification(p_company text,p_credit text,p_path text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if coalesce(length(trim(p_company)),0) not between 2 and 120 or p_credit is null or p_credit !~ '^[0-9A-Z]{18}$' or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text then raise exception 'INVALID_VERIFICATION';end if;
 if not exists(select 1 from storage.objects where bucket_id='merchant-verification' and name=p_path) then raise exception 'LICENSE_NOT_UPLOADED';end if;
 if exists(select 1 from public.merchant_profiles where user_id=auth.uid() and verification_status='verified') then raise exception 'ALREADY_VERIFIED';end if;
 insert into public.merchant_profiles(user_id,company_name,credit_code,license_storage_path,verification_status) values(auth.uid(),trim(p_company),p_credit,p_path,'pending') on conflict(user_id) do update set company_name=excluded.company_name,credit_code=excluded.credit_code,license_storage_path=excluded.license_storage_path,verification_status='pending',updated_at=now();
 update public.profiles set current_mode='merchant' where id=auth.uid();
 perform public.huoda_audit(auth.uid(),'verification_submitted','merchant',auth.uid(),null,jsonb_build_object('status','pending'));
end $$;
create function public.submit_report(p_task_id uuid,p_reason text,p_detail text default '') returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r_id uuid;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if coalesce(length(trim(p_reason)),0) not between 1 and 120 or length(p_detail)>2000 then raise exception 'INVALID_REPORT';end if;
 if not exists(select 1 from public.tasks t where t.id=p_task_id and ((t.review_status='approved' and t.status='open') or t.owner_id=auth.uid() or public.is_task_participant(t.id))) then raise exception 'TASK_NOT_FOUND';end if;
 insert into public.reports(reporter_id,task_id,reason,detail) values(auth.uid(),p_task_id,p_reason,coalesce(p_detail,'')) returning id into r_id;return r_id;
end $$;

-- Service-only, actor is independently checked against a table with no client grants.
create function public.admin_moderate(p_actor uuid,p_kind text,p_id uuid,p_status text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b jsonb;n jsonb;u uuid;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'ADMIN_REQUIRED';end if;
 if p_kind='merchant' and p_status in ('verified','rejected') then
  select to_jsonb(m) into b from public.merchant_profiles m where user_id=p_id for update;
  if b is null or b->>'verification_status'<>'pending' then raise exception 'INVALID_REVIEW_STATE';end if;
  update public.merchant_profiles set verification_status=p_status,verified_at=case when p_status='verified' then now() end,updated_at=now() where user_id=p_id returning to_jsonb(merchant_profiles) into n;u=p_id;
 elsif p_kind='task' and p_status in ('approved','rejected') then
  select to_jsonb(t) into b from public.tasks t where id=p_id for update;
  if b is null or b->>'review_status'<>'pending' then raise exception 'INVALID_REVIEW_STATE';end if;
  if p_status='approved' and not exists(select 1 from public.merchant_profiles where user_id=(b->>'owner_id')::uuid and verification_status='verified') then raise exception 'MERCHANT_NOT_VERIFIED';end if;
  update public.tasks set review_status=p_status,verified=(p_status='approved') where id=p_id returning to_jsonb(tasks) into n;u=(b->>'owner_id')::uuid;
 elsif p_kind='report' and p_status in ('resolved','dismissed') then
  select to_jsonb(r) into b from public.reports r where id=p_id for update;
  if b is null or b->>'status'<>'open' then raise exception 'INVALID_REVIEW_STATE';end if;
  update public.reports set status=p_status where id=p_id returning to_jsonb(reports) into n;u=(b->>'reporter_id')::uuid;
 else raise exception 'INVALID_MODERATION';end if;
 perform public.huoda_audit(p_actor,'moderate_'||p_status,p_kind,p_id,b,n);
 perform public.huoda_notify(u,'moderation',case p_kind when 'merchant' then '商家认证结果' when 'task' then '任务审核结果' else '举报处理结果' end,case p_status when 'verified' then '认证通过' when 'approved' then '审核通过' when 'rejected' then '审核未通过，请检查后重新提交' when 'resolved' then '举报已处理' else '举报不成立' end,jsonb_build_object('kind',p_kind,'target_id',p_id));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('merchant-verification','merchant-verification',false,10485760,array['image/jpeg','image/png','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy huoda_license_insert on storage.objects for insert to authenticated with check(bucket_id='merchant-verification' and (storage.foldername(name))[1]=auth.uid()::text);
create policy huoda_license_read on storage.objects for select to authenticated using(bucket_id='merchant-verification' and (storage.foldername(name))[1]=auth.uid()::text);
-- No client UPDATE/DELETE: submitted evidence cannot be replaced during moderation.
do $$ declare f record;begin
 for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('is_task_participant','handle_new_user','protect_profile_verification','protect_task_review','validate_application_transition','huoda_notify','huoda_audit','save_my_profile','search_nearby_tasks','apply_to_task','transition_application','accept_application','submit_review','send_text_message','mark_conversation_read','mark_notification_read','get_public_profile','create_task','submit_merchant_verification','submit_report','admin_moderate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('search_nearby_tasks','get_public_profile','is_task_participant') then execute format('grant execute on function %s to anon,authenticated',f.signature);
  elsif f.proname in ('save_my_profile','apply_to_task','transition_application','accept_application','submit_review','send_text_message','mark_conversation_read','mark_notification_read','create_task','submit_merchant_verification','submit_report') then execute format('grant execute on function %s to authenticated',f.signature);
  elsif f.proname='admin_moderate' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
grant all on public.worker_profiles,public.merchant_profiles,public.favorites,public.reviews,public.notifications,public.audit_logs,public.admin_users to service_role;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications;end if;
 end if;
end $$;
commit;
