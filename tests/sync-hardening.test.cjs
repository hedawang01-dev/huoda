const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('@playwright/test');
async function withPage(run){const browser=await chromium.launch({headless:true,executablePath:require('./browser-path.cjs')});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8085');await page.waitForSelector('.task-card');await run(page);}finally{await browser.close();}}

test('delayed account data cannot return after logout or A-B-A identity changes',async()=>withPage(async page=>{
 const result=await page.evaluate(async()=>{
  await demoLogin('worker');const user=state.user;state.route='messages';
  const original={client:sb,hydrate:H.services.auth.hydrate,list:H.services.favorite.list,inbox:H.services.inbox.load};
  let release;const pending=new Promise(resolve=>release=resolve);
  const rows={applications:[{id:'old-private-application'}],reports:[{id:'old-private-report'}],notifications:[{id:'old-private-notice'}],reviews:[{id:'old-private-review'}],tasks:[{id:'old-private-task',price:10}]};
  sb={from(table){const chain={select(){return chain;},eq(){return chain;},order(){return chain;},limit(){return chain;},is(){return chain;},then(resolve,reject){return pending.then(()=>({data:rows[table]||[],count:1,error:null})).then(resolve,reject);}};return chain;}};
  H.services.auth.hydrate=async()=>{};H.services.favorite.list=async()=>['old-private-favorite'];H.services.inbox.load=async()=>true;CLOUD_ENABLED=true;
  const request=loadData();await Promise.resolve();await Promise.resolve();
  state.user={id:'other-user'};state.user=user;release();await request;
  const result={applications:state.applications,reports:state.reports,notifications:state.notifications,reviews:state.reviews,ownTasks:state.ownTasks,favorites:state.favorites};
  CLOUD_ENABLED=false;sb=original.client;H.services.auth.hydrate=original.hydrate;H.services.favorite.list=original.list;H.services.inbox.load=original.inbox;
  return result;
 });
 for(const [field,value] of Object.entries(result))assert.deepEqual(value,[],field);
}));

test('queued local mutation refuses a changed identity before acquiring the write lock',async()=>withPage(async page=>{
 const result=await page.evaluate(async()=>{
  await demoLogin('worker');let acquired,unlock;
  const ready=new Promise(resolve=>acquired=resolve),gate=new Promise(resolve=>unlock=resolve);
  const holding=navigator.locks.request('huoda-v050-write',async()=>{acquired();await gate;});await ready;
  let ran=false;const mutation=H.localWrite(()=>{ran=true;}).then(()=>null,e=>e.message);
  state.user=null;unlock();await holding;return {error:await mutation,ran};
 });
 assert.deepEqual(result,{error:'SESSION_CHANGED',ran:false});
}));

test('a slow detail refresh cannot replace a newer task; transient errors retain the detail',async()=>withPage(async page=>{
 const result=await page.evaluate(async()=>{
  await openTask('demo-1');const oldLoad=loadData,oldGet=H.services.task.get;
  loadData=async()=>true;let signal,release;const started=new Promise(resolve=>signal=resolve),pending=new Promise(resolve=>release=resolve);
  H.services.task.get=async()=>{signal();await pending;return {id:'demo-1',title:'old response'};};
  H.refreshLive();await started;state.selectedTask=localDb().tasks.find(t=>t.id==='demo-2');release();
  while(H.syncBusy)await new Promise(resolve=>setTimeout(resolve,10));
  const selected=state.selectedTask.id;
  H.services.task.get=async()=>{throw new Error('Failed to fetch');};H.refreshLive();await new Promise(resolve=>setTimeout(resolve,350));
  const result={selected,afterFailure:state.selectedTask.id,route:state.route};loadData=oldLoad;H.services.task.get=oldGet;return result;
 });
 assert.deepEqual(result,{selected:'demo-2',afterFailure:'demo-2',route:'detail'});
}));

test('incomplete admin cloud configuration never opens the local moderation queue',async()=>withPage(async page=>{
 await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.HUODA_CONFIG={SUPABASE_URL:'https://example.supabase.co'};"}));
 await page.goto('http://127.0.0.1:8085/admin/');
 assert.match(await page.locator('#adminApp').innerText(),/未切换本地审核模拟器/);
 assert.equal(await page.locator('.admin-tabs').count(),0);
}));

test('network status presents recovery feedback without erasing the current page',async()=>withPage(async page=>{
 const count=await page.locator('.task-card').count();
 await page.evaluate(()=>{CLOUD_ENABLED=true;window.dispatchEvent(new Event('offline'));});
 assert.match(await page.locator('#syncStatus').innerText(),/网络已断开/);
 assert.equal(await page.locator('.task-card').count(),count);
 await page.evaluate(()=>{CLOUD_ENABLED=false;H.syncStatus('ok');});assert.equal(await page.locator('#syncStatus').isVisible(),false);
}));
