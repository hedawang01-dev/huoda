begin;
create function public.edit_task_details(p_task_id uuid,p_title text,p_description text,p_time_text text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks;a public.applications;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into t from public.tasks where id=p_task_id and owner_id=auth.uid() for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if coalesce(length(trim(p_title)),0) not between 1 and 120 or coalesce(length(trim(p_description)),0) not between 1 and 10000 or coalesce(length(trim(p_time_text)),0) not between 1 and 200 then raise exception 'INVALID_TASK';end if;
 if exists(select 1 from public.applications where task_id=t.id and status in ('accepted','completed')) then raise exception 'TASK_HAS_CONFIRMED_WORKERS';end if;
 update public.tasks set title=trim(p_title),description=trim(p_description),time_text=trim(p_time_text),review_status='pending' where id=t.id;
 for a in select * from public.applications where task_id=t.id and status='applied' loop
  perform public.huoda_notify(a.worker_id,'task_changed','商家更新了任务信息',p_time_text,jsonb_build_object('application_id',a.id,'task_id',t.id));
 end loop;
 perform public.huoda_audit(auth.uid(),'edited','task',t.id,to_jsonb(t),jsonb_build_object('title',p_title,'description',p_description,'time_text',p_time_text,'review_status','pending'));
end $$;
revoke all on function public.edit_task_details(uuid,text,text,text) from public,anon;
grant execute on function public.edit_task_details(uuid,text,text,text) to authenticated;
commit;
