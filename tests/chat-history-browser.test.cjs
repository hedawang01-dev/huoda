const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('@playwright/test');
test('chat history pages preserve drafts, position and loaded messages across live refresh',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:require('./browser-path.cjs')});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8085');await page.waitForSelector('.task-card');
  await page.evaluate(async()=>{
   await demoLogin('worker');const db=localDb();
   db.applications.push({id:'history-app',task_id:'demo-2',worker_id:'worker-demo',merchant_id:'merchant-demo',status:'accepted',created_at:'2026-09-01T00:00:00Z'});
   for(let i=1;i<=450;i++)db.messages.push({id:'history-'+String(i).padStart(4,'0'),application_id:'history-app',sender_id:'merchant-demo',content:'history-'+i,message_type:'text',read_at:null,created_at:'2026-09-01T00:00:00Z'});
   saveLocal(db);await loadData();await openChat('history-app');
  });
  assert.equal(await page.locator('.msg-row').count(),200);
  assert.match(await page.locator('.msg-row').first().innerText(),/history-251/);
  await page.locator('#chatText').fill('尚未发送的历史核对草稿');
  await page.locator('.chat-list').evaluate(e=>e.scrollTop=0);
  await page.locator('#chatHistoryMore').click();await page.waitForFunction(()=>state.messages.length===400);
  assert.equal(await page.locator('#chatText').inputValue(),'尚未发送的历史核对草稿');
  assert.match(await page.locator('.msg-row').first().innerText(),/history-51/);
  // An offline page request leaves the existing history and cursor retryable.
  await page.evaluate(()=>{const original=H.services.inbox.conversation;window.restoreHistoryService=()=>H.services.inbox.conversation=original;H.services.inbox.conversation=async(id,options)=>{if(options?.before)throw new Error('历史加载失败，请重试');return original.call(H.services.inbox,id,options);};});
  await page.locator('.chat-list').evaluate(e=>e.scrollTop=0);await page.locator('#chatHistoryMore').click();await page.waitForFunction(()=>!H.historyPending);
  assert.equal(await page.locator('.msg-row').count(),400);assert.equal(await page.locator('#chatHistoryMore').isEnabled(),true);
  await page.evaluate(()=>window.restoreHistoryService());await page.locator('#chatHistoryMore').click();await page.waitForFunction(()=>state.messages.length===450);
  assert.equal(await page.locator('#chatHistoryMore').count(),0);assert.match(await page.locator('.msg-row').first().innerText(),/history-1\n/);
  await page.evaluate(async()=>{await H.localWrite(db=>db.messages.push({id:'history-0451',application_id:'history-app',sender_id:'merchant-demo',content:'new live message',message_type:'text',read_at:null,created_at:'2026-09-02T00:00:00Z'}));H.refreshLive();});
  await page.waitForFunction(()=>state.messages.length===451);assert.match(await page.locator('.msg-row').last().innerText(),/new live message/);
  assert.equal(await page.locator('#chatText').inputValue(),'尚未发送的历史核对草稿');
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // A burst larger than a page resets to a contiguous newest window with
  // a usable cursor, rather than silently leaving a hole in the history.
  await page.evaluate(()=>{
   const application=state.selectedApplication;
   const messages=Array.from({length:200},(_,i)=>({id:'burst-'+i,application_id:application.id,content:'burst',created_at:new Date(1800000000000+i).toISOString()}));
   H.applyConversationPage({application,messages,next_cursor:{created_at:messages[0].created_at,id:messages[0].id}});
  });
  assert.equal(await page.evaluate(()=>state.messages.length),200);assert.ok(await page.evaluate(()=>H.historyCursor));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
