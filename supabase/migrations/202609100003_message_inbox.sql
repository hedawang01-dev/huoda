-- Conversation summaries are read on the server, not inferred from the last 200 messages.
begin;
create function public.get_message_inbox(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if length(coalesce(p_query,''))>100 then raise exception 'INVALID_SEARCH';end if;
 with conversations as (
  select a.id application_id,a.task_id,a.status,t.title task_title,t.company_name,
   p.id peer_id,p.name peer_name,p.avatar_url,
   case when a.worker_id=auth.uid() then 'merchant' else 'worker' end peer_kind,
   t.price_fen,t.price_unit,last_msg.content last_content,last_msg.message_type last_type,
   last_msg.sender_id last_sender_id,last_msg.read_at last_read_at,
   coalesce(last_msg.created_at,a.created_at) updated_at,
   (select count(*) from public.messages m where m.application_id=a.id and m.sender_id<>auth.uid() and m.message_type='text' and m.read_at is null) unread_count
  from public.applications a join public.tasks t on t.id=a.task_id
  join public.profiles p on p.id=case when a.worker_id=auth.uid() then a.merchant_id else a.worker_id end
  left join lateral (select m.* from public.messages m where m.application_id=a.id order by m.created_at desc,m.id desc limit 1) last_msg on true
  where auth.uid() in(a.worker_id,a.merchant_id) and (a.status in('accepted','completed') or exists(select 1 from public.messages m where m.application_id=a.id and m.message_type='text'))
 ), matched as (
  select c.* from conversations c where coalesce(p_query,'')='' or
   strpos(lower(concat_ws(' ',c.peer_name,c.company_name,c.task_title)),lower(p_query))>0 or
   exists(select 1 from public.messages m where m.application_id=c.application_id and strpos(lower(m.content),lower(p_query))>0)
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc,c.application_id) from matched c),'[]'::jsonb),
  'chat_unread',coalesce((select sum(unread_count) from conversations),0),
  'notice_unread',(select count(*) from public.notifications where user_id=auth.uid() and type<>'message' and read_at is null)
 ) into result;return result;
end $$;
revoke all on function public.get_message_inbox(text) from public,anon;
grant execute on function public.get_message_inbox(text) to authenticated;
commit;
