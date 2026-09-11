-- Additive API: deploy after 004 and before the updated conversation service.
-- Existing tables, functions and data are unchanged. Old clients still work.
-- Rollback: restore the previous client before dropping this function/index.
begin;
create index if not exists messages_conversation_cursor_idx
 on public.messages(application_id,created_at desc,id desc);

create function public.get_conversation_messages(
 p_application_id uuid,p_before_at timestamptz default null,
 p_before_id uuid default null,p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.applications where id=p_application_id and auth.uid() in(worker_id,merchant_id)) then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 200 or (p_before_at is null)<>(p_before_id is null) then raise exception 'INVALID_PAGE';end if;
 -- Timestamp plus ID is a stable cursor even when many messages share a time.
 -- A JSON envelope is not truncated by the PostgREST maximum row setting.
 with page as (
  select m.* from public.messages m where m.application_id=p_application_id
   and (p_before_at is null or (m.created_at,m.id)<(p_before_at,p_before_id))
  order by m.created_at desc,m.id desc limit p_limit+1
 ), visible as (
  select * from page order by created_at desc,id desc limit p_limit
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id desc) from visible m),'[]'::jsonb),
  'next_cursor',case when (select count(*) from page)>p_limit then
   (select jsonb_build_object('created_at',created_at,'id',id) from visible order by created_at,id limit 1)
   else null end
 ) into result;
 return result;
end $$;
revoke all on function public.get_conversation_messages(uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_conversation_messages(uuid,timestamptz,uuid,integer) to authenticated;
commit;
