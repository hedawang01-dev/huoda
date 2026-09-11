const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const changed=/SESSION_CHANGED/;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const turn=()=>new Promise(r=>setImmediate(r));
const plain=value=>JSON.parse(JSON.stringify(value));

// Isolated service tests implement the core session contract, including A→B→A.
// No browser, HTTP server or Supabase credentials are required.
function harness({cloud=true,respond=()=>({data:null}),guest=[],gate=null,realCore=false}={}){
 const calls=[],state={profile:null,favorites:[]};let user=null,epoch=0,saved=0;
 Object.defineProperty(state,'user',{configurable:true,get:()=>user,set:value=>{if(user?.id!==value?.id)epoch++;user=value;}});
 const users=['A','B'].map(id=>({id,name:id,city:'广州',current_mode:'worker',skills:[],verification_status:'unverified'}));
 const db={users,favoritesByUser:{},tasks:[],applications:[],messages:[],notifications:[]};
 state.user=users[0];state.profile={...users[0]};
 let H={services:{},fail:code=>{throw new Error(code);},auth:()=>{if(!state.user)throw new Error('AUTH_REQUIRED');return state.user.id;},unwrap:r=>{if(r.error)throw r.error;return r.data;},task:x=>x};
 H.captureSession=()=>({id:state.user?.id,epoch});
 H.isCurrentSession=s=>s.id===state.user?.id&&s.epoch===epoch;
 H.localWrite=async fn=>{if(gate)await gate.promise;const result=fn(db);saved++;return result;};
 const sb={from(table){const request={table,filters:{},op:'select'};const q={select(){return q;},eq(key,value){request.filters[key]=value;return q;},in(){return q;},order(){return q;},limit(){return q;},single(){return q;},maybeSingle(){return q;},insert(value){request.op='insert';request.value=value;return q;},upsert(value){request.op='upsert';request.value=value;return q;},delete(){request.op='delete';return q;},then(resolve,reject){calls.push(request);return Promise.resolve().then(()=>respond(request)).then(resolve,reject);}};return q;}};
 const storage={removed:0,removeItem(){this.removed++;guest=[];}};
 const context=vm.createContext({H,state,sb,CLOUD_ENABLED:cloud,localDb:()=>db,saveLocal:()=>saved++,navigator:{locks:gate?{request:async(_,fn)=>{await gate.promise;return fn();}}:null},enrichUser:u=>({...u}),loadFavorites:()=>[...guest],saveFavorites:()=>{},localStorage:storage,FAV_KEY:'guest'});
 if(realCore){vm.runInContext(fs.readFileSync(path.join(root,'src/core/services.js'),'utf8'),context);H=vm.runInContext('H',context);}
 H.rpc=async(name,args)=>{const request={rpc:name,args};calls.push(request);return H.unwrap(await respond(request));};
 for(const file of ['authService.js','favoriteService.js','inboxService.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/services',file),'utf8'),context,{filename:file});
 return {H,state,db,calls,storage,get saved(){return saved;}};
}

for(const switchBack of [false,true])test(`hydrate rejects stale profile after A→B${switchBack?'→A':''}`,async()=>{
 const delay=deferred();
 const h=harness({respond:r=>r.table==='profiles'?delay.promise:{data:null}});
 const pending=h.H.services.auth.hydrate({id:'A'}),rejected=assert.rejects(pending,changed);
 await turn();h.state.user={id:'B'};if(switchBack)h.state.user={id:'A'};
 h.state.profile={id:h.state.user.id,name:'new session'};
 delay.resolve({data:{id:'A',name:'stale',current_mode:'worker'}});
 await rejected;assert.equal(h.state.profile.name,'new session');assert.equal(h.calls.length,1);
});

test('hydrate only publishes the latest same-user request',async()=>{
 const old=deferred();let profiles=0;
 const h=harness({respond:r=>r.table==='profiles'?(++profiles===1?old.promise:{data:{id:'A',name:'fresh',current_mode:'worker'}}):{data:null}});
 const first=h.H.services.auth.hydrate({id:'A'});await turn();await h.H.services.auth.hydrate({id:'A'});
 old.resolve({data:{id:'A',name:'old',current_mode:'worker'}});await first;
 assert.equal(h.state.profile.name,'fresh');
});

test('local profile save cannot forge identity, verification or account flags',async()=>{
 const h=harness({cloud:false});
 await h.H.services.auth.save({name:' edited ',id:'B',verification_status:'verified',verified:true,active:false,company_name:'forged'});
 const a=h.db.users[0];assert.equal(a.id,'A');assert.equal(a.name,'edited');assert.equal(a.verification_status,'unverified');
 assert.equal(a.verified,undefined);assert.equal(a.active,undefined);assert.equal(a.company_name,undefined);assert.equal(h.db.users[1].name,'B');
 await assert.rejects(h.H.services.auth.save({current_mode:'admin'}),/INVALID_PROFILE/);
 await assert.rejects(h.H.services.auth.save({skills:Array(9).fill('x')}),/INVALID_PROFILE/);
 assert.equal(h.saved,1);
});

test('queued local save and favorite merge stop after identity changes',async()=>{
 for(const action of ['save','merge','toggle']){
  const gate=deferred(),h=harness({cloud:false,guest:['task'],gate});
  const pending=action==='save'?h.H.services.auth.save({name:'changed'}):h.H.services.favorite[action]('task');
  const rejected=assert.rejects(pending,changed);h.state.user={id:'B'};h.state.user={id:'A'};gate.resolve();await rejected;
  assert.equal(h.saved,0);assert.equal(h.db.users[0].name,'A');assert.deepEqual(h.db.favoritesByUser,{});assert.equal(h.storage.removed,0);
 }
});

test('cloud save does not hydrate the new account after its RPC returns',async()=>{
 const delay=deferred(),h=harness({respond:()=>delay.promise});
 const pending=h.H.services.auth.save({name:'saved'}),rejected=assert.rejects(pending,changed);
 h.state.user={id:'B'};h.state.profile={id:'B',name:'B'};delay.resolve({data:null});await rejected;
 assert.equal(h.calls.length,1);assert.equal(h.state.profile.name,'B');
});

test('favorite merge cannot move guest favorites into another account',async()=>{
 const delay=deferred(),id='50000000-0000-0000-0000-000000000001';
 const h=harness({guest:[id],respond:()=>delay.promise});
 const pending=h.H.services.favorite.merge(),rejected=assert.rejects(pending,changed);
 await turn();h.state.user={id:'B'};h.state.favorites=['B-only'];delay.resolve({data:{id}});await rejected;
 assert.equal(h.calls.length,1);assert.deepEqual(h.state.favorites,['B-only']);assert.equal(h.storage.removed,0);
});

test('favorite toggle/list reject late A data after an A→B→A switch',async()=>{
 for(const action of ['toggle','list']){
  const delay=deferred(),h=harness({respond:r=>r.op==='upsert'||r.op==='insert'?{data:null}:delay.promise});
  const pending=h.H.services.favorite[action]('task'),rejected=assert.rejects(pending,changed);
  await turn();h.state.user={id:'B'};h.state.user={id:'A'};h.state.favorites=['new-session'];
  delay.resolve({data:[{task_id:'old-session'}]});await rejected;assert.deepEqual(h.state.favorites,['new-session']);
 }
});

test('successful favorite merge is deduplicated and clears guest storage only after reload',async()=>{
 const id='50000000-0000-0000-0000-000000000001';
 const h=harness({guest:[id,id,'-'.repeat(36)],respond:r=>r.table==='tasks'?{data:{id}}:r.op==='upsert'?{data:null}:{data:[{task_id:id}]}});
 await h.H.services.favorite.merge();assert.deepEqual(plain(h.state.favorites),[id]);assert.equal(h.storage.removed,1);
 assert.equal(h.calls.filter(r=>r.op==='upsert').length,1);assert.equal(h.calls.find(r=>r.op==='upsert').value.user_id,'A');
});

test('cloud conversation fetches one page per call, with explicit cursors for 450 messages',async()=>{
 const messages=Array.from({length:450},(_,i)=>({id:String(450-i).padStart(4,'0'),content:String(450-i),created_at:'2026-09-11T00:00:00.123456Z'}));
 const h=harness({respond:r=>{
  if(!r.rpc)return {data:{id:'app',worker_id:'A',merchant_id:'B'}};
  if(r.rpc!=='get_conversation_messages')throw new Error('unexpected RPC');
  const start=r.args.p_before_id?messages.findIndex(m=>m.id===r.args.p_before_id)+1:0;
  const items=messages.slice(start,start+200),last=items.at(-1);
  return {data:{items,next_cursor:start+200<messages.length?{created_at:last.created_at,id:last.id}:null}};
 }});
 const first=await h.H.services.inbox.conversation('app');assert.equal(first.messages.length,200);
 assert.equal(first.messages[0].content,'251');assert.equal(first.messages.at(-1).content,'450');assert.equal(h.calls.length,2);
 assert.deepEqual(plain(first.next_cursor),{id:'0251',created_at:'2026-09-11T00:00:00.123456Z'});
 const second=await h.H.services.inbox.conversation('app',{before:first.next_cursor});assert.equal(second.messages.length,200);
 assert.equal(second.messages[0].content,'51');assert.equal(second.messages.at(-1).content,'250');assert.equal(h.calls.length,4);
 assert.equal(h.calls.at(-1).args.p_before_at,first.next_cursor.created_at);
 const third=await h.H.services.inbox.conversation('app',{before:second.next_cursor});assert.equal(third.messages.length,50);
 assert.equal(third.messages[0].content,'1');assert.equal(third.messages.at(-1).content,'50');assert.equal(third.next_cursor,null);
 const all=[...third.messages,...second.messages,...first.messages];assert.equal(new Set(all.map(m=>m.id)).size,450);
 assert.equal(h.calls.length,6);assert.ok(h.calls.filter(r=>r.rpc).every(r=>r.args.p_limit===200));
 // Refresh is a new latest-page read, not an automatic history download.
 messages.unshift({id:'0451',content:'451',created_at:'2026-09-11T01:00:00Z'});
 const fresh=await h.H.services.inbox.conversation('app');assert.equal(fresh.messages.length,200);
 assert.equal(fresh.messages.at(-1).content,'451');assert.equal(h.calls.length,8);assert.equal(h.calls.at(-1).args.p_before_id,null);
});

test('local conversation uses the same bounded page contract and preserves stored order',async()=>{
 for(const count of [0,200,201,450]){
  const h=harness({cloud:false});h.db.applications.push({id:'app',worker_id:'A',merchant_id:'B'});
  h.db.messages=Array.from({length:count},(_,i)=>({id:String(i+1).padStart(4,'0'),application_id:'app',content:String(i+1),created_at:'2026-09-11T00:00:00Z'}));
  h.db.messages.push({id:'other',application_id:'private',content:'not this conversation',created_at:'2026-09-12T00:00:00Z'});
  const original=plain(h.db.messages),all=[];let before=null,pages=0;
  do{
   const result=await h.H.services.inbox.conversation('app',{before});assert.ok(result.messages.length<=200);
   assert.equal(result.messages.length,Math.min(200,Math.max(0,count-pages*200)));
   for(let i=1;i<result.messages.length;i++)assert.ok(result.messages[i-1].id<result.messages[i].id);
   all.push(...result.messages);before=result.next_cursor;pages++;
  }while(before);
  assert.equal(all.length,count);assert.equal(new Set(all.map(m=>m.id)).size,count);assert.deepEqual(plain(h.db.messages),original);
  h.state.user={id:'stranger'};await assert.rejects(h.H.services.inbox.conversation('app'),/FORBIDDEN/);
 }
});

test('malformed conversation cursors fail before fetching data in either store',async()=>{
 for(const cloud of [false,true]){
  const h=harness({cloud});
  for(const before of ['bad',{},[],{id:'x'},{created_at:'2026-09-11'},{id:'x',created_at:'not a date'},{id:'',created_at:'2026-09-11'}])
   await assert.rejects(h.H.services.inbox.conversation('app',{before}),/INVALID_PAGE/);
  assert.equal(h.calls.length,0);
 }
});

test('conversation returns no old-account page after switch',async()=>{
 const delay=deferred(),h=harness({respond:r=>r.rpc?delay.promise:{data:{id:'app'}}});
 const pending=h.H.services.inbox.conversation('app'),rejected=assert.rejects(pending,changed);
 await turn();h.state.user={id:'B'};delay.resolve({data:{items:[{id:'private'}],next_cursor:{id:'private',created_at:'2026-09-11'}}});
 await rejected;assert.equal(h.calls.length,2);
});

test('actual core identity setter and service guards reject A→B→A hydration',async()=>{
 const delay=deferred(),h=harness({realCore:true,respond:r=>r.table==='profiles'?delay.promise:{data:null}});
 const pending=h.H.services.auth.hydrate({id:'A'}),rejected=assert.rejects(pending,changed);
 await turn();h.state.user={id:'B'};h.state.user={id:'A'};h.state.profile={id:'A',name:'new session'};
 delay.resolve({data:{id:'A',name:'old session',current_mode:'worker'}});await rejected;
 assert.equal(h.state.profile.name,'new session');assert.equal(h.calls.length,1);
});

test('actual core write lock and service guard preserve both accounts on switch',async()=>{
 const gate=deferred(),h=harness({cloud:false,realCore:true,gate});
 const pending=h.H.services.auth.save({name:'changed'}),rejected=assert.rejects(pending,changed);
 h.state.user={id:'B'};h.state.user={id:'A'};gate.resolve();await rejected;
 assert.equal(h.saved,0);assert.equal(h.db.users[0].name,'A');assert.equal(h.db.users[1].name,'B');
});

test('005 migration: PostgreSQL cursor, permissions and backwards compatibility (not live Supabase/PostGIS)',async t=>{
 const fixture=await require('./cloud-fixture.cjs')();
 try{await fixture.admin(async db=>{
  const {merchant,worker,admin}=fixture.ids;
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role]);await db.exec('set role '+role);};
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const taskId=await scalar("select id from public.tasks where owner_id=$1 and status='open' and review_status='approved' limit 1",[merchant]);
  await as(worker);const app=await scalar('select to_jsonb(public.apply_to_task($1))',[taskId]);
  await as(merchant);await db.query('select public.accept_application($1)',[app.id]);
  await db.exec('reset role');
  // More than two pages with identical timestamps exercise the UUID tie breaker.
  await db.query(`insert into public.messages(id,application_id,sender_id,content,created_at)
   select ('60000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,$1,$2,'history-'||i,'2026-01-01T00:00:00Z' from generate_series(1,450) i`,[app.id,merchant]);
  const before=Number(await scalar('select count(*) from public.messages where application_id=$1',[app.id]));
  await t.test('all rows fetched exactly once despite same timestamps and a newer concurrent insert',async()=>{
   await as(worker);const all=[];let cursor=null,pages=0;
   do{
    const page=await scalar('select public.get_conversation_messages($1,$2,$3,200)',[app.id,cursor?.created_at??null,cursor?.id??null]);
    all.push(...page.items);cursor=page.next_cursor;pages++;
    if(pages===1){await as(merchant);await db.query("select public.send_text_message($1,'new arrival')",[app.id]);await as(worker);}
   }while(cursor);
   assert.equal(all.length,before);assert.equal(new Set(all.map(m=>m.id)).size,before);assert.equal(pages,3);
   assert.ok(all.some(m=>m.content==='history-1'));assert.ok(all.some(m=>m.content==='history-450'));
   assert.ok(!all.some(m=>m.content==='new arrival'));
  });
  await t.test('strangers and anonymous callers cannot read conversation pages',async()=>{
   await as(admin);await assert.rejects(db.query('select public.get_conversation_messages($1)',[app.id]),/FORBIDDEN/);
   await as('', 'anon');await assert.rejects(db.query('select public.get_conversation_messages($1)',[app.id]),/permission denied/);
   await as('');await assert.rejects(db.query('select public.get_conversation_messages($1)',[app.id]),/AUTH_REQUIRED/);
  });
  await t.test('reject malformed cursors and excessive page sizes',async()=>{
   await as(worker);
   for(const limit of [null,0,201])await assert.rejects(db.query('select public.get_conversation_messages($1,null,null,$2)',[app.id,limit]),/INVALID_PAGE/);
   await assert.rejects(db.query("select public.get_conversation_messages($1,now(),null)",[app.id]),/INVALID_PAGE/);
   await assert.rejects(db.query('select public.get_conversation_messages($1,null,$2)',[app.id,app.id]),/INVALID_PAGE/);
  });
  await t.test('legacy inbox/send/read RPCs still work and migration does not alter messages',async()=>{
   await as(worker);const inbox=await scalar('select public.get_message_inbox()');
   assert.equal(Number(inbox.chat_unread),451);
   await db.query('select public.mark_conversation_read($1)',[app.id]);
   assert.equal(Number((await scalar('select public.get_message_inbox()')).chat_unread),0);
   assert.equal(Number(await scalar('select count(*) from public.messages where application_id=$1',[app.id])),before+1);
   await as(merchant);assert.equal((await scalar('select public.get_conversation_messages($1,null,null,1)',[app.id])).items.length,1);
  });
 });}finally{await fixture.close();}
});
