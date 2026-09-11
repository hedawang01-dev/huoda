// Deterministically derive the extended search from the existing v0.5 query.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'supabase/migrations/202609100001_v050_foundation.sql'),'utf8');
let query=source.slice(source.indexOf('create function public.search_nearby_tasks('),source.indexOf('create function public.apply_to_task('));
query=query.replaceAll('search_nearby_tasks','search_tasks_v051').replace("keyword text default '')","keyword text default '',min_price_fen bigint default null,max_price_fen bigint default null,price_unit_filter text default null)");
query=query.replace('declare origin extensions.geography; result jsonb; begin',`declare origin extensions.geography; result jsonb; begin
 if min_price_fen < 0 or max_price_fen < 0 or min_price_fen > 100000000 or max_price_fen > 100000000 or min_price_fen > max_price_fen or (price_unit_filter is not null and price_unit_filter not in ('小时','次','单')) then raise exception 'INVALID_PRICE_RANGE';end if;`);
query=query.replace('and (radius_km is null or',`and (min_price_fen is null or t.price_fen>=min_price_fen)
 and (max_price_fen is null or t.price_fen<=max_price_fen)
 and (price_unit_filter is null or t.price_unit=price_unit_filter)
 and (radius_km is null or`);
const signature='double precision,double precision,double precision,text,text,text,text,text,integer,integer,text,bigint,bigint,text';
const sql=`-- v0.5.1: same tables, same permissions; extend search and keep public badges current.
begin;
${query}
revoke all on function public.search_tasks_v051(${signature}) from public,anon,authenticated;
grant execute on function public.search_tasks_v051(${signature}) to anon,authenticated;

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
`;
fs.writeFileSync(path.join(root,'supabase/migrations/202609100004_desktop_sync.sql'),sql);
