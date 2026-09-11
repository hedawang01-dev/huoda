-- v0.5.1: same tables, same permissions; extend search and keep public badges current.
begin;
create function public.search_tasks_v051(user_lat double precision default null,user_lng double precision default null,radius_km double precision default null,city text default null,work_type text default null,pay_mode text default null,shift text default null,sort_mode text default 'recommend',page_limit integer default 20,page_cursor integer default 0,keyword text default '',min_price_fen bigint default null,max_price_fen bigint default null,price_unit_filter text default null) returns jsonb language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare origin extensions.geography; result jsonb; begin
 if min_price_fen < 0 or max_price_fen < 0 or min_price_fen > 100000000 or max_price_fen > 100000000 or min_price_fen > max_price_fen or (price_unit_filter is not null and price_unit_filter not in ('小时','次','单')) then raise exception 'INVALID_PRICE_RANGE';end if;
 if (user_lat is null)<>(user_lng is null) or user_lat not between -90 and 90 or user_lng not between -180 and 180 or radius_km not between 0.1 and 10 or page_limit is null or page_limit not between 1 and 50 or page_cursor is null or page_cursor<0 or length(coalesce(keyword,''))>100 or sort_mode is null or sort_mode not in ('recommend','distance','price','newest') then raise exception 'INVALID_SEARCH';end if;
 if user_lat is not null then origin=extensions.st_setsrid(extensions.st_makepoint(user_lng,user_lat),4326)::extensions.geography;end if;
 if (radius_km is not null or sort_mode='distance') and origin is null then raise exception 'LOCATION_REQUIRED';end if;
 with matching as (
 select t.*,case when origin is not null and t.type='offline' then extensions.st_distance(t.location_geog,origin) end distance_meters,
 ((case when exists(select 1 from public.worker_profiles w where w.user_id=auth.uid() and w.skills && t.tags) then 40 else 0 end)
 +case when origin is not null and t.type='offline' and extensions.st_dwithin(t.location_geog,origin,3000) then 20 else 0 end
 +case when t.created_at>now()-interval '7 days' then 5 else 0 end) recommendation_score
 from public.tasks t where t.review_status='approved' and t.status='open' and t.spots_left>0
 and (search_tasks_v051.city is null or t.type='online' or t.city=search_tasks_v051.city)
 and (work_type is null or t.type=work_type) and (search_tasks_v051.pay_mode is null or t.pay_mode=search_tasks_v051.pay_mode)
 and (search_tasks_v051.shift is null or t.shift=search_tasks_v051.shift or search_tasks_v051.shift=any(t.tags))
 and (coalesce(keyword,'')='' or strpos(lower(concat_ws(' ',t.title,t.category,t.location,t.company_name,t.description,array_to_string(t.tags,' '))),lower(keyword))>0)
 and (min_price_fen is null or t.price_fen>=min_price_fen)
 and (max_price_fen is null or t.price_fen<=max_price_fen)
 and (price_unit_filter is null or t.price_unit=price_unit_filter)
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


revoke all on function public.search_tasks_v051(double precision,double precision,double precision,text,text,text,text,text,integer,integer,text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.search_tasks_v051(double precision,double precision,double precision,text,text,text,text,text,integer,integer,text,bigint,bigint,text) to anon,authenticated;

-- tasks.verified is a public display cache, maintained from the protected merchant record.
create function public.sync_merchant_task_badges() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.tasks set verified=(new.verification_status='verified') where owner_id=new.user_id and verified is distinct from (new.verification_status='verified');
 return new;
end $$;
revoke all on function public.sync_merchant_task_badges() from public,anon,authenticated;
create trigger merchant_task_badges after insert or update of verification_status on public.merchant_profiles
 for each row execute function public.sync_merchant_task_badges();
update public.tasks t set verified=coalesce((select m.verification_status='verified' from public.merchant_profiles m where m.user_id=t.owner_id),false);
commit;
