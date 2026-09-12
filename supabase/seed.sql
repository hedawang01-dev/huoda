-- TEST PROJECT ONLY. Create these three emails in Supabase Authentication first.
-- No password, service key or fake production account is shipped in this file.
-- Run as the database owner after migrations; repeat execution is safe.
begin;
do $$
declare merchant uuid;worker uuid;reviewer uuid;i integer;task_id uuid;
begin
 select id into merchant from auth.users where email='merchant@huoda.test';
 select id into worker from auth.users where email='worker@huoda.test';
 select id into reviewer from auth.users where email='admin@huoda.test';
 if merchant is null or worker is null or reviewer is null then raise exception 'Create merchant@huoda.test, worker@huoda.test, admin@huoda.test in Auth before seed';end if;
 update public.profiles set name='小何（测试）',city='广州',skills=array['PS','电商设计'] where id=worker;
 update public.worker_profiles set bio='擅长电商图片处理与活动协助。',skills=array['PS','电商设计'] where user_id=worker;
 update public.profiles set name='南屿电商（测试）',city='广州',current_mode='merchant' where id=merchant;
 insert into public.merchant_profiles(user_id,company_name,verification_status,verified_at) values(merchant,'南屿电商（测试）','verified',now()) on conflict(user_id) do update set company_name=excluded.company_name,verification_status='verified',verified_at=coalesce(merchant_profiles.verified_at,now());
 insert into public.admin_users(user_id) values(reviewer) on conflict do nothing;
 for i in 1..28 loop
  task_id=('50000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
  insert into public.tasks(id,owner_id,type,title,price,price_fen,price_unit,pay_mode,settlement,time_text,location,city,tags,company_name,description,spots_total,spots_left,status,review_status,verified,category,shift,lat,lng,coordinate_system,location_geog)
  values(task_id,merchant,case when i%3=0 then 'online' else 'offline' end,
   case when i%3=0 then '电商设计主图精修' else '广州活动协助' end||' · 测试 '||i,
   100+i*5,(100+i*5)*100,'次',case when i%3=0 then '完工结' when i%2=0 then '周结' else '日结' end,
   '按约定完成后结算','周末白班 10:00–16:00',case when i%3=0 then '线上' else '广州·越秀区（测试点）' end,'广州',array['PS','周末','白班'],'南屿电商（测试）','仅用于功能验收的测试任务，不是真实招聘。',2,2,'recruiting','approved',true,case when i%3=0 then '设计' else '活动执行' end,'白班',
   case when i%3<>0 then 23.1291+i*0.001 end,case when i%3<>0 then 113.2644+i*0.001 end,
   case when i%3<>0 then 'WGS84' end,case when i%3<>0 then extensions.st_setsrid(extensions.st_makepoint(113.2644+i*0.001,23.1291+i*0.001),4326)::extensions.geography end)
  on conflict(id) do nothing;
 end loop;
end $$;
commit;
