-- v0.5.4: cloud lifecycle, transactional capacity and compatible RPCs.
-- Apply once after 202609110005_service_hardening.sql.
begin;

-- Expand first so existing rows can be mapped without disabling integrity.
alter table public.tasks add column if not exists updated_at timestamptz;
alter table public.tasks add column if not exists ended_at timestamptz;
alter table public.tasks add column if not exists taken_down_at timestamptz;
alter table public.applications add column if not exists updated_at timestamptz;
alter table public.applications add column if not exists completed_by uuid references public.profiles(id);

update public.tasks set updated_at=coalesce(updated_at,created_at,now());
update public.applications set updated_at=coalesce(updated_at,created_at,now());
alter table public.tasks alter column updated_at set default now();
alter table public.tasks alter column updated_at set not null;
alter table public.applications alter column updated_at set default now();
alter table public.applications alter column updated_at set not null;

-- Old values are mapped before the new constraint is installed. Review state
-- distinguishes an old submitted task from a publicly recruiting task.
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks
set status=case
 when status='open' and review_status='pending' then 'pending_review'
 when status='open' and review_status='rejected' then 'taken_down'
 when status='open' and spots_left=0 then 'full'
 when status='open' then 'recruiting'
 when status='closed' and spots_left=0 then 'full'
 when status in ('closed','paused','completed') then 'ended'
 else status end,
 ended_at=case when status in ('closed','paused','completed') and not(status='closed' and spots_left=0)
  then coalesce(ended_at,now()) else ended_at end,
 taken_down_at=case when status='open' and review_status='rejected'
  then coalesce(taken_down_at,now()) else taken_down_at end;

do $$ begin
 if exists(select 1 from public.tasks where status not in ('draft','pending_review','recruiting','full','ended','taken_down')) then
  raise exception 'V054_UNKNOWN_TASK_STATUS';
 end if;
 if exists(select 1 from public.tasks where spots_left<0 or spots_left>spots_total) then
  raise exception 'V054_INVALID_CAPACITY';
 end if;
end $$;

alter table public.tasks add constraint tasks_status_check
 check(status in ('draft','pending_review','recruiting','full','ended','taken_down'));
alter table public.tasks alter column status set default 'draft';

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
 check(status in ('applied','viewed','communicating','accepted','rejected','completed','cancelled'));

create or replace function public.validate_application_transition()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.status=new.status then return new;end if;
 if old.status='applied' and new.status in ('viewed','communicating','accepted','rejected','cancelled') then return new;end if;
 if old.status='viewed' and new.status in ('communicating','accepted','rejected','cancelled') then return new;end if;
 if old.status='communicating' and new.status in ('accepted','rejected','cancelled') then return new;end if;
 if old.status='accepted' and new.status in ('completed','cancelled') then return new;end if;
 raise exception 'INVALID_TRANSITION';
end $$;
revoke all on function public.validate_application_transition() from public,anon,authenticated;

create function public.close_open_applications_v054(p_task_id uuid,p_actor uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.applications;old_a jsonb;task_title text;
begin
 select title into task_title from public.tasks where id=p_task_id;
 for a in select * from public.applications where task_id=p_task_id
  and status in ('applied','viewed','communicating') for update loop
  old_a=to_jsonb(a);
  update public.applications set status='rejected',updated_at=now() where id=a.id returning * into a;
  perform public.huoda_notify(a.worker_id,'rejected','报名已结束',task_title,
   jsonb_build_object('application_id',a.id,'task_id',p_task_id,'reason',p_reason));
  insert into public.messages(application_id,sender_id,content,message_type)
  values(a.id,p_actor,'任务已结束，本次报名不再继续','system');
  perform public.huoda_audit(p_actor,'rejected_'||p_reason,'application',a.id,old_a,to_jsonb(a));
 end loop;
end $$;
revoke all on function public.close_open_applications_v054(uuid,uuid,text) from public,anon,authenticated;

-- Public rows use the new lifecycle. Owners and historical participants retain
-- access to their own records, including drafts and ended work.
drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select to anon,authenticated using(
 (review_status='approved' and status='recruiting' and spots_left>0 and (end_at is null or end_at>now()))
 or owner_id=auth.uid() or public.is_task_participant(id)
);
drop policy if exists favorite_add on public.favorites;
create policy favorite_add on public.favorites for insert to authenticated with check(
 user_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id
  and t.status='recruiting' and t.review_status='approved' and t.spots_left>0
  and (t.end_at is null or t.end_at>now()))
);

-- Raw review relationship IDs are private. Public profile summaries continue
-- through get_public_profile(), whose SECURITY DEFINER projection omits them.
revoke select on public.reviews from anon,authenticated;
drop policy if exists review_read on public.reviews;
grant select on public.reviews to authenticated;
create policy review_participant_read on public.reviews for select to authenticated
 using(auth.uid() in(reviewer_id,reviewee_id));

create index if not exists applications_merchant_created_idx
 on public.applications(merchant_id,created_at desc);
create index if not exists applications_task_status_updated_idx
 on public.applications(task_id,status,updated_at desc);
create index if not exists tasks_v054_feed_idx
 on public.tasks(review_status,status,created_at desc,id);
create index if not exists tasks_v054_expiry_idx
 on public.tasks(end_at) where status in ('pending_review','recruiting','full');

create function public.search_tasks_v054(
 user_lat double precision default null,user_lng double precision default null,
 radius_km double precision default null,city text default null,
 work_type text default null,pay_mode text default null,shift text default null,
 sort_mode text default 'recommend',page_limit integer default 20,
 page_cursor integer default 0,keyword text default '',
 min_price_fen bigint default null,max_price_fen bigint default null,
 price_unit_filter text default null
) returns jsonb language plpgsql stable security definer
set search_path=public,extensions,pg_temp as $$
declare origin extensions.geography;result jsonb;
begin
 if min_price_fen<0 or max_price_fen<0 or min_price_fen>100000000 or max_price_fen>100000000
  or min_price_fen>max_price_fen or (price_unit_filter is not null and price_unit_filter not in ('小时','次','单'))
  then raise exception 'INVALID_PRICE_RANGE';end if;
 if (user_lat is null)<>(user_lng is null) or user_lat not between -90 and 90
  or user_lng not between -180 and 180 or radius_km not between 0.1 and 10
  or page_limit is null or page_limit not between 1 and 50 or page_cursor is null or page_cursor<0
  or length(coalesce(keyword,''))>100 or sort_mode is null
  or sort_mode not in ('recommend','distance','price','newest') then raise exception 'INVALID_SEARCH';end if;
 if user_lat is not null then
  origin=extensions.st_setsrid(extensions.st_makepoint(user_lng,user_lat),4326)::extensions.geography;
 end if;
 if (radius_km is not null or sort_mode='distance') and origin is null then raise exception 'LOCATION_REQUIRED';end if;
 with matching as(
  select t.*,
   case when origin is not null and t.type='offline' then extensions.st_distance(t.location_geog,origin) end distance_meters,
   ((case when exists(select 1 from public.worker_profiles w where w.user_id=auth.uid() and w.skills&&t.tags) then 40 else 0 end)
    +case when origin is not null and t.type='offline' and extensions.st_dwithin(t.location_geog,origin,3000) then 20 else 0 end
    +case when t.created_at>now()-interval '7 days' then 5 else 0 end) recommendation_score
  from public.tasks t where t.review_status='approved' and t.status='recruiting' and t.spots_left>0
   and (t.end_at is null or t.end_at>now())
   and (search_tasks_v054.city is null or t.type='online' or t.city=search_tasks_v054.city)
   and (work_type is null or t.type=work_type)
   and (search_tasks_v054.pay_mode is null or t.pay_mode=search_tasks_v054.pay_mode)
   and (search_tasks_v054.shift is null or t.shift=search_tasks_v054.shift or search_tasks_v054.shift=any(t.tags))
   and (coalesce(keyword,'')='' or strpos(lower(concat_ws(' ',t.title,t.category,t.location,t.company_name,t.description,array_to_string(t.tags,' '))),lower(keyword))>0)
   and (min_price_fen is null or t.price_fen>=min_price_fen)
   and (max_price_fen is null or t.price_fen<=max_price_fen)
   and (price_unit_filter is null or t.price_unit=price_unit_filter)
   and (radius_km is null or (t.type='offline' and extensions.st_dwithin(t.location_geog,origin,radius_km*1000)))
 ),paged as(
  select * from matching order by
   case when sort_mode='distance' then distance_meters end asc nulls last,
   case when sort_mode='price' then price_fen end desc,
   case when sort_mode='recommend' then recommendation_score end desc,
   created_at desc,id limit page_limit offset page_cursor
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(p)-'location_geog') from paged p),'[]'::jsonb),
  'total',(select count(*) from matching),
  'next_cursor',case when page_cursor+page_limit<(select count(*) from matching) then page_cursor+page_limit else null end
 ) into result;
 return result;
end $$;

create function public.create_task_v054(p_task jsonb,p_submit boolean default true)
returns public.tasks language plpgsql security definer
set search_path=public,extensions,pg_temp as $$
declare m public.merchant_profiles;p public.profiles;t public.tasks;
 fen bigint;spots integer;lat double precision;lng double precision;
 start_value timestamptz;end_value timestamptz;tags_value jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if p_submit is null or p_task is null or jsonb_typeof(p_task)<>'object' then raise exception 'INVALID_TASK';end if;
 tags_value=coalesce(p_task->'tags','[]'::jsonb);
 if jsonb_typeof(tags_value)<>'array' or jsonb_array_length(tags_value)>8
  or exists(select 1 from jsonb_array_elements(tags_value) x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>40)
  then raise exception 'INVALID_TASK';end if;
 begin
  fen=(p_task->>'price_fen')::bigint;spots=(p_task->>'spots_total')::integer;
  start_value=nullif(p_task->>'start_at','')::timestamptz;
  end_value=nullif(p_task->>'end_at','')::timestamptz;
  if p_task->>'type'='offline' then
   lat=(p_task->>'lat')::double precision;lng=(p_task->>'lng')::double precision;
  end if;
 exception when others then raise exception 'INVALID_TASK';end;
 if fen is null or fen not between 1 and 100000000 or spots is null or spots not between 1 and 1000
  or coalesce(length(trim(p_task->>'title')),0) not between 1 and 120
  or coalesce(length(p_task->>'description'),0) not between 1 and 10000
  or coalesce(length(p_task->>'time_text'),0) not between 1 and 200
  or coalesce(length(p_task->>'location'),0) not between 1 and 200
  or coalesce(length(p_task->>'settlement'),0) not between 1 and 200
  or (p_task->>'type') not in ('online','offline')
  or (p_task->>'pay_mode') not in ('日结','周结','月结','完工结')
  or coalesce(p_task->>'price_unit','次') not in ('小时','次','单')
  or coalesce(p_task->>'schedule_type','flexible') not in ('flexible','fixed','deadline')
  or length(coalesce(p_task->>'city',''))>60 or length(coalesce(p_task->>'category',''))>60
  or length(coalesce(p_task->>'shift',''))>60
  or (end_value is not null and start_value is not null and end_value<=start_value)
  then raise exception 'INVALID_TASK';end if;
 if p_task->>'type'='offline' and (lat is null or lng is null or lat not between -90 and 90
  or lng not between -180 and 180 or p_task->>'coordinate_system' is distinct from 'WGS84'
  or coalesce(p_task->>'city','')='') then raise exception 'WGS84_LOCATION_REQUIRED';end if;
 if p_submit and end_value is not null and end_value<=now() then raise exception 'TASK_EXPIRED';end if;
 select * into p from public.profiles where id=auth.uid() for share;
 if not found then raise exception 'PROFILE_NOT_FOUND';end if;
 select * into m from public.merchant_profiles where user_id=auth.uid() for share;
 if p_submit and (not found or m.verification_status<>'verified') then raise exception 'MERCHANT_NOT_VERIFIED';end if;
 insert into public.tasks(
  owner_id,type,title,price,price_fen,price_unit,pay_mode,settlement,time_text,location,tags,
  company_name,description,spots_total,spots_left,status,verified,review_status,city,category,
  shift,lat,lng,coordinate_system,location_geog,start_at,end_at,schedule_type,updated_at
 ) values(
  auth.uid(),p_task->>'type',trim(p_task->>'title'),fen/100.0,fen,coalesce(p_task->>'price_unit','次'),
  p_task->>'pay_mode',p_task->>'settlement',p_task->>'time_text',p_task->>'location',
  array(select jsonb_array_elements_text(tags_value)),coalesce(nullif(m.company_name,''),p.name,'商家'),
  p_task->>'description',spots,spots,case when p_submit then 'pending_review' else 'draft' end,
  coalesce(m.verification_status='verified',false),'pending',coalesce(p_task->>'city',''),
  coalesce(p_task->>'category','兼职'),coalesce(p_task->>'shift',''),lat,lng,
  case when lat is not null then 'WGS84' end,
  case when lat is not null then extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography end,
  start_value,end_value,coalesce(p_task->>'schedule_type','flexible'),now()
 ) returning * into t;
 perform public.huoda_audit(auth.uid(),case when p_submit then 'submitted' else 'drafted' end,'task',t.id,null,to_jsonb(t));
 return t;
end $$;

create function public.transition_task_v054(p_task_id uuid,p_status text)
returns public.tasks language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks;old_t jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into t from public.tasks where id=p_task_id and owner_id=auth.uid() for update;
 if not found then raise exception 'FORBIDDEN';end if;
 old_t=to_jsonb(t);
 if p_status='pending_review' then
  if t.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
  if not exists(select 1 from public.merchant_profiles where user_id=auth.uid() and verification_status='verified')
   then raise exception 'MERCHANT_NOT_VERIFIED';end if;
  if t.end_at is not null and t.end_at<=now() then raise exception 'TASK_EXPIRED';end if;
  update public.tasks set status='pending_review',review_status='pending',updated_at=now() where id=t.id returning * into t;
 elsif p_status='ended' then
  if t.status not in ('recruiting','full') then raise exception 'INVALID_TRANSITION';end if;
  update public.tasks set status='ended',ended_at=now(),updated_at=now() where id=t.id returning * into t;
  perform public.close_open_applications_v054(t.id,auth.uid(),'task_ended');
 elsif p_status='taken_down' then
  if t.status not in ('draft','pending_review','recruiting','full') then raise exception 'INVALID_TRANSITION';end if;
  update public.tasks set status='taken_down',taken_down_at=now(),updated_at=now() where id=t.id returning * into t;
  perform public.close_open_applications_v054(t.id,auth.uid(),'task_taken_down');
 else raise exception 'INVALID_TRANSITION';end if;
 perform public.huoda_audit(auth.uid(),'task_'||p_status,'task',t.id,old_t,to_jsonb(t));
 return t;
end $$;

create function public.edit_task_v054(p_task_id uuid,p_title text,p_description text,p_time_text text)
returns public.tasks language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks;a public.applications;old_t jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into t from public.tasks where id=p_task_id and owner_id=auth.uid() for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if t.status='ended' then raise exception 'INVALID_TRANSITION';end if;
 if t.status<>'draft' and not exists(select 1 from public.merchant_profiles where user_id=auth.uid() and verification_status='verified')
  then raise exception 'MERCHANT_NOT_VERIFIED';end if;
 if coalesce(length(trim(p_title)),0) not between 1 and 120
  or coalesce(length(trim(p_description)),0) not between 1 and 10000
  or coalesce(length(trim(p_time_text)),0) not between 1 and 200 then raise exception 'INVALID_TASK';end if;
 if exists(select 1 from public.applications where task_id=t.id and status in ('accepted','completed'))
  then raise exception 'TASK_HAS_CONFIRMED_WORKERS';end if;
 old_t=to_jsonb(t);
 update public.tasks set title=trim(p_title),description=trim(p_description),time_text=trim(p_time_text),
  status=case when status='draft' then 'draft' else 'pending_review' end,
  review_status='pending',taken_down_at=null,updated_at=now()
 where id=t.id returning * into t;
 for a in select * from public.applications where task_id=t.id and status in ('applied','viewed','communicating') loop
  perform public.huoda_notify(a.worker_id,'task_changed','商家更新了任务信息',p_time_text,
   jsonb_build_object('application_id',a.id,'task_id',t.id));
 end loop;
 perform public.huoda_audit(auth.uid(),'edited','task',t.id,old_t,to_jsonb(t));
 return t;
end $$;

create function public.apply_to_task_v054(p_task_id uuid)
returns public.applications language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks;a public.applications;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into t from public.tasks where id=p_task_id for update;
 if not found then raise exception 'TASK_NOT_FOUND';end if;
 if t.owner_id=auth.uid() then raise exception 'SELF_APPLICATION';end if;
 if exists(select 1 from public.applications where task_id=t.id and worker_id=auth.uid())
  then raise exception 'DUPLICATE_APPLICATION';end if;
 if t.status<>'recruiting' or t.review_status<>'approved' or t.spots_left<=0
  or (t.end_at is not null and t.end_at<=now()) then raise exception 'TASK_UNAVAILABLE';end if;
 insert into public.applications(task_id,worker_id,merchant_id,status,updated_at)
 values(t.id,auth.uid(),t.owner_id,'applied',now()) returning * into a;
 perform public.huoda_notify(auth.uid(),'applied','报名成功',t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 perform public.huoda_notify(t.owner_id,'applied','收到新报名',t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 perform public.huoda_audit(auth.uid(),'applied','application',a.id,null,to_jsonb(a));
 return a;
end $$;

create function public.transition_application_v054(p_application_id uuid,p_status text)
returns public.applications language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks;a public.applications;old_a jsonb;task_key uuid;title_text text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select task_id into task_key from public.applications
  where id=p_application_id and auth.uid() in(worker_id,merchant_id);
 if not found then raise exception 'FORBIDDEN';end if;
 -- Every capacity-changing path locks task before application.
 select * into t from public.tasks where id=task_key for update;
 select * into a from public.applications where id=p_application_id for update;
 if not found then raise exception 'FORBIDDEN';end if;
 old_a=to_jsonb(a);
 if p_status='viewed' then
  if auth.uid()<>a.merchant_id or a.status<>'applied' then raise exception 'INVALID_TRANSITION';end if;
  if t.status not in ('recruiting','full') or (t.end_at is not null and t.end_at<=now()) then raise exception 'TASK_UNAVAILABLE';end if;
  title_text='商家已查看你的报名';
 elsif p_status='communicating' then
  if auth.uid()<>a.merchant_id or a.status not in ('applied','viewed') then raise exception 'INVALID_TRANSITION';end if;
  if t.status not in ('recruiting','full') or (t.end_at is not null and t.end_at<=now()) then raise exception 'TASK_UNAVAILABLE';end if;
  title_text='商家希望进一步沟通';
 elsif p_status='accepted' then
  if auth.uid()<>a.merchant_id or a.status not in ('applied','viewed','communicating') then raise exception 'INVALID_TRANSITION';end if;
  if t.status<>'recruiting' or t.review_status<>'approved' or t.spots_left<=0
   or (t.end_at is not null and t.end_at<=now()) then raise exception 'TASK_UNAVAILABLE';end if;
  update public.tasks set spots_left=spots_left-1,
   status=case when spots_left=1 then 'full' else status end,updated_at=now()
   where id=t.id returning * into t;
  title_text='商家已录用你';
 elsif p_status='rejected' then
  if auth.uid()<>a.merchant_id or a.status not in ('applied','viewed','communicating') then raise exception 'INVALID_TRANSITION';end if;
  title_text='商家未录用此次报名';
 elsif p_status='cancelled' then
  if auth.uid()<>a.worker_id or a.status not in ('applied','viewed','communicating','accepted') then raise exception 'INVALID_TRANSITION';end if;
  if a.status='accepted' then
   update public.tasks set spots_left=least(spots_total,spots_left+1),
    status=case when status='full' and review_status='approved' and (end_at is null or end_at>now()) then 'recruiting' else status end,
    updated_at=now() where id=t.id returning * into t;
  end if;
  title_text='求职者已取消报名';
 elsif p_status='completed' then
  if a.status<>'accepted' then raise exception 'INVALID_TRANSITION';end if;
  title_text='任务已完成，可以评价合作体验';
 else raise exception 'INVALID_TRANSITION';end if;
 update public.applications set status=p_status,updated_at=now(),
  completed_at=case when p_status='completed' then now() else completed_at end,
  completed_by=case when p_status='completed' then auth.uid() else completed_by end
 where id=a.id returning * into a;
 perform public.huoda_notify(a.worker_id,p_status,title_text,t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 perform public.huoda_notify(a.merchant_id,p_status,title_text,t.title,jsonb_build_object('application_id',a.id,'task_id',t.id));
 insert into public.messages(application_id,sender_id,content,message_type)
 values(a.id,auth.uid(),title_text,'system');
 perform public.huoda_audit(auth.uid(),p_status,'application',a.id,old_a,to_jsonb(a));
 return a;
end $$;

create function public.send_text_message_v054(p_application_id uuid,p_content text)
returns public.messages language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.applications;m public.messages;other_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into a from public.applications where id=p_application_id
  and auth.uid() in(worker_id,merchant_id) for share;
 if not found or a.status not in ('communicating','accepted') then raise exception 'CHAT_UNAVAILABLE';end if;
 if p_content is null or length(trim(p_content)) not between 1 and 2000 then raise exception 'INVALID_MESSAGE';end if;
 insert into public.messages(application_id,sender_id,content,message_type)
 values(a.id,auth.uid(),trim(p_content),'text') returning * into m;
 other_id=case when auth.uid()=a.worker_id then a.merchant_id else a.worker_id end;
 perform public.huoda_notify(other_id,'message','收到新消息',left(trim(p_content),80),
  jsonb_build_object('application_id',a.id,'message_id',m.id));
 return m;
end $$;

-- Conversation list understands the new communicating state while preserving
-- the existing response envelope and fields.
create or replace function public.get_message_inbox(p_query text default '')
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if length(coalesce(p_query,''))>100 then raise exception 'INVALID_SEARCH';end if;
 with conversations as(
  select a.id application_id,a.task_id,a.status,t.title task_title,t.company_name,
   p.id peer_id,p.name peer_name,p.avatar_url,
   case when a.worker_id=auth.uid() then 'merchant' else 'worker' end peer_kind,
   t.price_fen,t.price_unit,last_msg.content last_content,last_msg.message_type last_type,
   last_msg.sender_id last_sender_id,last_msg.read_at last_read_at,
   coalesce(last_msg.created_at,a.created_at) updated_at,
   (select count(*) from public.messages m where m.application_id=a.id and m.sender_id<>auth.uid()
    and m.message_type='text' and m.read_at is null) unread_count
  from public.applications a join public.tasks t on t.id=a.task_id
  join public.profiles p on p.id=case when a.worker_id=auth.uid() then a.merchant_id else a.worker_id end
  left join lateral(select m.* from public.messages m where m.application_id=a.id
   order by m.created_at desc,m.id desc limit 1) last_msg on true
  where auth.uid() in(a.worker_id,a.merchant_id) and
   (a.status in('communicating','accepted','completed') or exists(
    select 1 from public.messages m where m.application_id=a.id and m.message_type='text'))
 ),matched as(
  select c.* from conversations c where coalesce(p_query,'')='' or
   strpos(lower(concat_ws(' ',c.peer_name,c.company_name,c.task_title)),lower(p_query))>0 or
   exists(select 1 from public.messages m where m.application_id=c.application_id
    and strpos(lower(m.content),lower(p_query))>0)
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc,c.application_id) from matched c),'[]'::jsonb),
  'chat_unread',coalesce((select sum(unread_count) from conversations),0),
  'notice_unread',(select count(*) from public.notifications where user_id=auth.uid() and type<>'message' and read_at is null)
 ) into result;
 return result;
end $$;

-- Existing public RPCs remain safe for stale clients and delegate to the v054
-- state machine instead of applying obsolete open/closed transitions.
create or replace function public.create_task(p_task jsonb) returns public.tasks
language sql security definer set search_path=public,extensions,pg_temp as $$
 select public.create_task_v054($1,true)
$$;
create or replace function public.apply_to_task(p_task_id uuid) returns public.applications
language sql security definer set search_path=public,pg_temp as $$
 select public.apply_to_task_v054($1)
$$;
create or replace function public.transition_application(p_application_id uuid,p_status text)
returns public.applications language sql security definer set search_path=public,pg_temp as $$
 select public.transition_application_v054($1,$2)
$$;
create or replace function public.accept_application(p_application_id uuid) returns public.applications
language sql security definer set search_path=public,pg_temp as $$
 select public.transition_application_v054($1,'accepted')
$$;
create or replace function public.send_text_message(p_application_id uuid,p_content text)
returns public.messages language sql security definer set search_path=public,pg_temp as $$
 select public.send_text_message_v054($1,$2)
$$;
create or replace function public.edit_task_details(p_task_id uuid,p_title text,p_description text,p_time_text text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.edit_task_v054(p_task_id,p_title,p_description,p_time_text);end $$;

create or replace function public.search_nearby_tasks(
 user_lat double precision default null,user_lng double precision default null,
 radius_km double precision default null,city text default null,work_type text default null,
 pay_mode text default null,shift text default null,sort_mode text default 'recommend',
 page_limit integer default 20,page_cursor integer default 0,keyword text default ''
) returns jsonb language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select public.search_tasks_v054($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,null,null)
$$;
create or replace function public.search_tasks_v051(
 user_lat double precision default null,user_lng double precision default null,
 radius_km double precision default null,city text default null,work_type text default null,
 pay_mode text default null,shift text default null,sort_mode text default 'recommend',
 page_limit integer default 20,page_cursor integer default 0,keyword text default '',
 min_price_fen bigint default null,max_price_fen bigint default null,price_unit_filter text default null
) returns jsonb language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select public.search_tasks_v054($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
$$;

create or replace function public.submit_report(p_task_id uuid,p_reason text,p_detail text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if coalesce(length(trim(p_reason)),0) not between 1 and 120 or length(coalesce(p_detail,''))>2000
  then raise exception 'INVALID_REPORT';end if;
 if not exists(select 1 from public.tasks t where t.id=p_task_id and
  ((t.review_status='approved' and t.status='recruiting' and (t.end_at is null or t.end_at>now()))
   or t.owner_id=auth.uid() or public.is_task_participant(t.id))) then raise exception 'TASK_NOT_FOUND';end if;
 insert into public.reports(reporter_id,task_id,reason,detail)
 values(auth.uid(),p_task_id,trim(p_reason),coalesce(p_detail,'')) returning id into r_id;
 return r_id;
end $$;

-- Task moderation now owns lifecycle transitions. tasks.verified remains only a
-- cache of merchant verification and is never used as task-review state.
create or replace function public.admin_moderate(p_actor uuid,p_kind text,p_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b jsonb;n jsonb;u uuid;current_task public.tasks;
begin
 if auth.role() is distinct from 'service_role'
  or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'ADMIN_REQUIRED';end if;
 if p_kind='merchant' and p_status in ('verified','rejected') then
  select to_jsonb(m) into b from public.merchant_profiles m where user_id=p_id for update;
  if b is null or b->>'verification_status'<>'pending' then raise exception 'INVALID_REVIEW_STATE';end if;
  update public.merchant_profiles set verification_status=p_status,
   verified_at=case when p_status='verified' then now() end,updated_at=now()
   where user_id=p_id returning to_jsonb(merchant_profiles) into n;u=p_id;
 elsif p_kind='task' and p_status in ('approved','rejected','taken_down') then
  select * into current_task from public.tasks where id=p_id for update;
  if not found then raise exception 'INVALID_REVIEW_STATE';end if;
  b=to_jsonb(current_task);u=current_task.owner_id;
  if p_status='approved' then
   if current_task.status<>'pending_review' or current_task.review_status<>'pending'
    then raise exception 'INVALID_REVIEW_STATE';end if;
   if not exists(select 1 from public.merchant_profiles where user_id=current_task.owner_id and verification_status='verified')
    then raise exception 'MERCHANT_NOT_VERIFIED';end if;
   if current_task.end_at is not null and current_task.end_at<=now() then raise exception 'TASK_EXPIRED';end if;
   update public.tasks set review_status='approved',status=case when spots_left=0 then 'full' else 'recruiting' end,
    verified=true,updated_at=now() where id=p_id returning to_jsonb(tasks) into n;
  elsif p_status='rejected' then
   if current_task.status<>'pending_review' or current_task.review_status<>'pending'
    then raise exception 'INVALID_REVIEW_STATE';end if;
   update public.tasks set review_status='rejected',status='taken_down',taken_down_at=now(),updated_at=now()
    where id=p_id returning to_jsonb(tasks) into n;
   perform public.close_open_applications_v054(p_id,p_actor,'review_rejected');
  else
   if current_task.status not in ('recruiting','full') then raise exception 'INVALID_REVIEW_STATE';end if;
   update public.tasks set status='taken_down',taken_down_at=now(),updated_at=now()
    where id=p_id returning to_jsonb(tasks) into n;
   perform public.close_open_applications_v054(p_id,p_actor,'admin_taken_down');
  end if;
 elsif p_kind='report' and p_status in ('resolved','dismissed') then
  select to_jsonb(r) into b from public.reports r where id=p_id for update;
  if b is null or b->>'status'<>'open' then raise exception 'INVALID_REVIEW_STATE';end if;
  update public.reports set status=p_status where id=p_id returning to_jsonb(reports) into n;
  u=(b->>'reporter_id')::uuid;
 else raise exception 'INVALID_MODERATION';end if;
 perform public.huoda_audit(p_actor,'moderate_'||p_status,p_kind,p_id,b,n);
 perform public.huoda_notify(u,'moderation',
  case p_kind when 'merchant' then '商家认证结果' when 'task' then '任务审核结果' else '举报处理结果' end,
  case p_status when 'verified' then '认证通过' when 'approved' then '审核通过'
   when 'rejected' then '审核未通过，请检查后重新提交'
   when 'taken_down' then '任务已下架' when 'resolved' then '举报已处理' else '举报不成立' end,
  jsonb_build_object('kind',p_kind,'target_id',p_id));
end $$;

-- Reconcile the public merchant badge after replacing task moderation.
update public.tasks t set verified=coalesce((
 select m.verification_status='verified' from public.merchant_profiles m where m.user_id=t.owner_id
),false);

-- Minimal function grants. Helpers and trigger functions remain inaccessible.
do $$ declare f record;begin
 for f in select oid::regprocedure signature,proname from pg_proc
  where pronamespace='public'::regnamespace and proname in(
   'search_tasks_v054','create_task_v054','transition_task_v054','edit_task_v054',
   'apply_to_task_v054','transition_application_v054','send_text_message_v054',
   'search_nearby_tasks','search_tasks_v051','create_task','apply_to_task','transition_application',
   'accept_application','send_text_message','edit_task_details','get_message_inbox','submit_report','admin_moderate'
  ) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('search_tasks_v054','search_nearby_tasks','search_tasks_v051') then
   execute format('grant execute on function %s to anon,authenticated',f.signature);
  elsif f.proname='admin_moderate' then
   execute format('grant execute on function %s to service_role',f.signature);
  else
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- Realtime changes are invalidation signals; table RLS remains authoritative.
do $$ declare table_name text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach table_name in array array['merchant_profiles','tasks','applications'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename=table_name) then
    execute format('alter publication supabase_realtime add table public.%I',table_name);
   end if;
  end loop;
 end if;
end $$;

commit;
