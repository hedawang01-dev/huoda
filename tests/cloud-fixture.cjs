/* Test-only PostgREST/Auth adapter over real PostgreSQL SQL/RLS.
 * Auth transport is simulated; spatial functions are substitutes, and requests
 * are serialized on one PGlite connection. This is NOT live Supabase acceptance.
 */
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
const ids={merchant:'10000000-0000-0000-0000-000000000001',worker:'10000000-0000-0000-0000-000000000002',admin:'10000000-0000-0000-0000-000000000004'};
const root=path.resolve(__dirname,'..');
module.exports=async function fixture(){
 const db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema auth,public,extensions to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 create function extensions.st_makepoint(double precision,double precision) returns point language sql immutable as $$select point($1,$2)$$;
 create function extensions.st_setsrid(point,integer) returns point language sql immutable as $$select $1$$;
 create function extensions.st_distance(point,point) returns double precision language sql immutable as $$select ($1 <-> $2)*111000$$;
 create function extensions.st_dwithin(point,point,double precision) returns boolean language sql immutable as $$select extensions.st_distance($1,$2)<=$3$$;`);
 await db.exec(fs.readFileSync(path.join(root,'supabase.sql'),'utf8').replace('create extension if not exists pgcrypto;',''));
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).sort()){
  let sql=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8');sql=sql.replace('create extension if not exists postgis with schema extensions;','').replace(/do \$\$ begin\s+if \(select n\.nspname[\s\S]+?end \$\$;/,'').replace(/extensions\.geography\(Point,4326\)/g,'point').replace(/extensions\.geography/g,'point');await db.exec(sql);
 }
 for(const [name,id]of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,name+'@huoda.test',JSON.stringify({name})]);
 await db.query("insert into merchant_profiles(user_id,company_name,verification_status) values($1,'共享云端测试商家','verified')",[ids.merchant]);
 await db.query('insert into admin_users(user_id) values($1)',[ids.admin]);
 await db.exec(fs.readFileSync(path.join(root,'supabase/seed.sql'),'utf8').replace(/extensions\.geography/g,'point'));
 let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
 const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role]);await db.exec('set role '+role);};
 const admin=fn=>serial(async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role','service_role',false)");return fn(db);});
 const knownTables=new Set(['profiles','worker_profiles','merchant_profiles','tasks','applications','favorites','messages','notifications','reports','reviews']);
 const knownRpc=new Set(['search_nearby_tasks','search_tasks_v051','get_message_inbox','get_conversation_messages','get_public_profile','save_my_profile','apply_to_task','accept_application','transition_application','send_text_message','mark_conversation_read','mark_notification_read','submit_review','create_task']);
 const requests=[];
 async function attach(context){
  await context.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.HUODA_CONFIG={SUPABASE_URL:'https://huoda-fixture.supabase.co',SUPABASE_KEY:'sb_publishable_fixture',CITY:'广州'};"}));
  await context.route('https://huoda-fixture.supabase.co/**',route=>serial(async()=>{
   const request=route.request(),url=new URL(request.url()),method=request.method(),body=request.postData()?JSON.parse(request.postData()):{},headers=request.headers();
   const fulfill=(data,status=200,extra={})=>route.fulfill({status,contentType:'application/json',headers:extra,body:JSON.stringify(data)});
   if(url.pathname.includes('/auth/v1/token')){const role=body.email?.split('@')[0];if(!ids[role]||body.password!=='fixture-password')return fulfill({error:'invalid_credentials',message:'登录失败'},400);const user={id:ids[role],email:body.email,aud:'authenticated',role:'authenticated',user_metadata:{name:role},created_at:new Date().toISOString()};const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');return fulfill({access_token:token,refresh_token:'fixture-'+role,token_type:'bearer',expires_in:3600,user});}
   let id;try{id=JSON.parse(Buffer.from((headers.authorization||'').replace('Bearer ','').split('.')[1],'base64url')).sub;}catch{}
   if(url.pathname.includes('/auth/v1/logout'))return fulfill({});
   if(!url.pathname.startsWith('/rest/v1/'))return fulfill({message:'Unsupported fixture endpoint'},404);
   try{
    await as(id,id?'authenticated':'anon');const name=url.pathname.split('/').pop();requests.push({name,method,id,body});
    if(url.pathname.includes('/rpc/')){if(!knownRpc.has(name))throw new Error('Unsupported RPC '+name);const entries=Object.entries(body);const args=entries.map(([key],i)=>{if(!/^[a-z_]+$/.test(key))throw new Error('Invalid arg');return `${key}=>$${i+1}`;}).join(',');const values=entries.map(([,value])=>value&&typeof value==='object'&&!Array.isArray(value)?JSON.stringify(value):value);const result=await db.query(`select to_jsonb(public.${name}(${args})) as result`,values);return fulfill(result.rows[0].result);}
    if(!knownTables.has(name))throw new Error('Unsupported table');const values=[],where=[];
    for(const [key,filter]of url.searchParams){if(['select','order','limit','on_conflict'].includes(key))continue;if(!/^[a-z_]+$/.test(key))throw new Error('Invalid column');if(filter.startsWith('eq.')){values.push(filter.slice(3));where.push(`${key}=$${values.length}`);}else if(filter==='is.null')where.push(`${key} is null`);else if(filter.startsWith('in.(')){const parts=filter.slice(4,-1).split(',');where.push(`${key} in (${parts.map(v=>{values.push(v);return '$'+values.length;}).join(',')})`);}else throw new Error('Unsupported filter '+filter);}
    const condition=where.length?' where '+where.join(' and '):'';
    if(method==='POST'&&name==='favorites'){await db.query('insert into favorites(user_id,task_id) values($1,$2) on conflict do nothing',[body.user_id,body.task_id]);return fulfill(null,201);}
    if(method==='DELETE'&&name==='favorites'){await db.query('delete from favorites'+condition,values);return fulfill(null);}
    const selection=url.searchParams.get('select')||'*',joinTasks=selection.includes('tasks(*)');const columns=joinTasks?'*':selection;
    if(!/^(\*|[a-z_,]+)$/.test(columns))throw new Error('Invalid selection');
    const total=Number((await db.query(`select count(*) from ${name}${condition}`,values)).rows[0].count);
    let order=url.searchParams.get('order');if(order&&!/^[a-z_]+\.(asc|desc)$/.test(order))throw new Error('Invalid ordering');order=order?' order by '+order.replace('.',' '):'';
    const limit=Number(url.searchParams.get('limit'))||1000;let rows=(await db.query(`select ${columns} from ${name}${condition}${order} limit ${Math.min(limit,1000)}`,values)).rows;
    if(joinTasks)for(const row of rows)row.tasks=(await db.query('select * from tasks where id=$1',[row.task_id])).rows[0]||null;
    if(headers.accept?.includes('vnd.pgrst.object')){if(rows.length!==1)return fulfill({code:'PGRST116',details:`The result contains ${rows.length} rows`,message:'JSON object requested'},406);return fulfill(rows[0]);}
    return fulfill(rows,200,{'content-range':`0-${Math.max(0,rows.length-1)}/${total}`});
   }catch(e){return fulfill({message:e.message,code:e.code||'FIXTURE_ERROR'},400);}
  }));
  await context.routeWebSocket('wss://huoda-fixture.supabase.co/**',socket=>socket.close());
 }
 return {attach,ids,admin,requests,close:async()=>{await queue;await db.close();}};
};
