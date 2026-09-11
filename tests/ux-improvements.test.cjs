const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:require('./browser-path.cjs')});});
after(async()=>{await browser?.close();});
async function withPage(run,width=390){
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{await page.goto('http://127.0.0.1:8085');await page.waitForSelector('.task-card');await run(page,context);assert.deepEqual(errors,[]);}finally{await context.close();}
}
async function conversations(page){
 await page.evaluate(async()=>{
  await demoLogin('worker');const db=localDb();
  for(const [id,task] of [['ux-chat-a','demo-2'],['ux-chat-b','demo-1']])db.applications.push({id,task_id:task,worker_id:'worker-demo',merchant_id:'merchant-demo',status:'accepted',created_at:Date.now()});
  saveLocal(db);await loadData();await openChat('ux-chat-a');
 });
 await page.waitForSelector('#chatText');
}
async function publishFields(page){
 await page.evaluate(async()=>{await demoLogin('merchant');go('publish');});
 await page.locator('#pType').selectOption('online');await page.locator('#pTitle').fill('真实交付测试任务');
 await page.locator('#pPrice').fill('120');await page.locator('#pTime').fill('明天交付');
 await page.locator('#pLocation').fill('线上');await page.locator('#pDesc').fill('提供素材，交付五张精修图。');
}
test('UX: task links survive refresh, browser back/forward and missing tasks remain recoverable',async()=>withPage(async(page,context)=>{
 await page.evaluate(async()=>{await toggleFavorite(null,'demo-2');go('favorites');});await page.waitForSelector('.task-card');
 await page.locator('.task-card').first().click();await page.waitForSelector('.detail-card h2');assert.match(page.url(),/#\/detail\/demo-2$/);
 await page.getByRole('button',{name:'← 返回',exact:true}).click();await page.waitForSelector('.saved-head');assert.match(page.url(),/#\/favorites$/);
 await page.goForward();await page.waitForSelector('.detail-card h2');assert.match(page.url(),/#\/detail\/demo-2$/);
 await page.reload();await page.waitForSelector('.detail-card h2');assert.match(await page.locator('.detail-card h2').innerText(),/淘宝主图/);
 const direct=await context.newPage();await direct.goto('http://127.0.0.1:8085/#/detail/demo-6');await direct.waitForSelector('.detail-card h2');assert.match(await direct.locator('.detail-card h2').innerText(),/小红书/);
 await page.goto('http://127.0.0.1:8085/#/detail/missing-task');await page.getByRole('button',{name:'重新加载',exact:true}).waitFor();assert.match(page.url(),/missing-task$/);
 await page.getByRole('button',{name:'去找其他活'}).click();await page.waitForSelector('.task-card');
}));
test('UX: late task/chat responses cannot override a later navigation',async()=>withPage(async page=>{
 await page.evaluate(async()=>{
  const get=H.services.task.get;H.services.task.get=()=>new Promise(resolve=>window.releaseTask=resolve);
  window.pendingTask=openTask('demo-2');go('profile');releaseTask(state.tasks.find(t=>t.id==='demo-2'));await pendingTask;H.services.task.get=get;
 });assert.equal(await page.evaluate(()=>state.route),'profile');
 await conversations(page);
 await page.evaluate(async()=>{
  const get=H.services.inbox.conversation;H.services.inbox.conversation=()=>new Promise((resolve,reject)=>window.rejectChat=reject);
  window.pendingChat=openChat('ux-chat-b');go('home');rejectChat(new Error('旧请求失败'));await pendingChat;H.services.inbox.conversation=get;
 });assert.equal(await page.evaluate(()=>state.route),'home');await page.waitForSelector('.task-card');
}));
test('UX: publish draft survives navigation and refresh with account isolation',async()=>withPage(async page=>{
 await page.evaluate(()=>go('publish'));await page.locator('#pTitle').fill('游客草稿');await page.locator('#pDesc').fill('不要丢失说明');
 await page.evaluate(()=>{go('home');go('publish');});assert.equal(await page.locator('#pTitle').inputValue(),'游客草稿');
 await page.reload();await page.waitForSelector('#pTitle');assert.equal(await page.locator('#pDesc').inputValue(),'不要丢失说明');
 await page.evaluate(()=>demoLogin('merchant'));assert.equal(await page.locator('#pTitle').inputValue(),'');await page.locator('#pTitle').fill('商家草稿');
 await page.evaluate(()=>demoLogin('worker'));assert.equal(await page.locator('#pTitle').inputValue(),'');
 await page.evaluate(()=>demoLogin('merchant'));assert.equal(await page.locator('#pTitle').inputValue(),'商家草稿');
 assert.equal(await page.locator('label[for="pTitle"]').count(),1);
},1440));
test('UX: publish coalesces repeated submit and clears only confirmed submissions',async()=>withPage(async page=>{
 await publishFields(page);
 await page.evaluate(()=>{window.createCount=0;window.realCreate=H.services.task.create;H.services.task.create=()=>{++createCount;return new Promise(resolve=>window.finishCreate=resolve);};window.firstCreate=createTask();window.secondCreate=createTask();});
 assert.equal(await page.evaluate(()=>createCount),1);assert.equal(await page.locator('[onclick="createTask()"]').isDisabled(),true);
 await page.evaluate(async()=>{finishCreate({id:'created'});await Promise.all([firstCreate,secondCreate]);setPublishTab('new');});assert.equal(await page.locator('#pTitle').inputValue(),'');
 await page.locator('#pType').selectOption('online');await page.locator('#pTitle').fill('失败后保留');await page.locator('#pPrice').fill('120');await page.locator('#pTime').fill('明天');await page.locator('#pLocation').fill('线上');await page.locator('#pDesc').fill('交付标准');
 await page.evaluate(async()=>{H.services.task.create=async()=>{throw new Error('测试网络失败');};await createTask();});assert.equal(await page.locator('#pTitle').inputValue(),'失败后保留');assert.equal(await page.locator('[onclick="createTask()"]').isDisabled(),false);
 await page.reload();await page.waitForSelector('#pTitle');assert.equal(await page.locator('#pTitle').inputValue(),'失败后保留');
 await page.evaluate(async()=>{H.services.task.create=async()=>({id:'confirmed'});loadData=async()=>{throw new Error('发布后刷新失败');};await createTask();});
 assert.equal(await page.locator('[onclick="createTask()"]').count(),0);assert.match(await page.locator('.toast').last().innerText(),/任务已提交/);
 await page.evaluate(()=>setPublishTab('new'));assert.equal(await page.locator('#pTitle').inputValue(),'');
}));
test('UX: chat drafts survive conversation switching, refresh and responsive resizing',async()=>withPage(async page=>{
 await conversations(page);await page.locator('#chatText').fill('第一单的草稿');await page.evaluate(()=>openChat('ux-chat-b'));await page.locator('#chatText').fill('第二单的草稿');
 await page.evaluate(()=>openChat('ux-chat-a'));assert.equal(await page.locator('#chatText').inputValue(),'第一单的草稿');
 await page.reload();await page.waitForSelector('#chatText');assert.equal(await page.locator('#chatText').inputValue(),'第一单的草稿');
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('#chatText').inputValue(),'第一单的草稿');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.evaluate(()=>demoLogin('merchant'));await page.evaluate(()=>openChat('ux-chat-a'));assert.equal(await page.locator('#chatText').inputValue(),'');
 await page.evaluate(()=>demoLogin('worker'));await page.evaluate(()=>openChat('ux-chat-a'));assert.equal(await page.locator('#chatText').inputValue(),'第一单的草稿');
}));
test('UX: send failures retain drafts, IME Enter does not send, and success clears draft even when refresh fails',async()=>withPage(async page=>{
 await conversations(page);await page.locator('#chatText').fill('保留失败草稿');
 await page.evaluate(async()=>{window.sendCount=0;H.services.message.send=async()=>{++sendCount;throw new Error('发送失败');};document.getElementById('chatText').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));});assert.equal(await page.evaluate(()=>sendCount),0);
 await page.evaluate(()=>sendMessage());assert.equal(await page.locator('#chatText').inputValue(),'保留失败草稿');
 await page.evaluate(()=>{H.services.message.send=()=>{++sendCount;return new Promise(resolve=>window.finishSend=resolve);};window.firstSend=sendMessage();window.secondSend=sendMessage();});assert.equal(await page.evaluate(()=>sendCount),2);assert.equal(await page.locator('.chat-input button').isDisabled(),true);
 await page.evaluate(async()=>{H.services.inbox.conversation=async()=>{throw new Error('记录刷新失败');};finishSend({id:'sent'});await Promise.all([firstSend,secondSend]);});
 assert.equal(await page.locator('#chatText').inputValue(),'');assert.match(await page.locator('.toast').last().innerText(),/消息已发送/);assert.equal(await page.locator('.chat-input button').isDisabled(),false);
 await page.reload();await page.waitForSelector('#chatText');assert.equal(await page.locator('#chatText').inputValue(),'');
}));
test('UX: task cards support keyboard and pagination retry retains existing cards',async()=>withPage(async page=>{
 const card=page.locator('.task-card').first();await card.focus();await page.keyboard.press('Enter');await page.waitForSelector('.detail-card h2');
 await page.evaluate(()=>go('home'));await page.waitForSelector('.task-card');const count=await page.locator('#taskList .task-card').count();
 await page.evaluate(()=>{state.feedError='加载更多失败';state.nextCursor=20;updateFeedPager();});assert.equal(await page.locator('#taskList .task-card').count(),count);assert.equal(await page.getByRole('button',{name:'重试加载更多'}).isVisible(),true);
 await page.evaluate(()=>{state.tasks=[];state.nextCursor=null;updateFeedPager();});assert.equal(await page.locator('#taskList .task-card').count(),0);assert.equal(await page.getByRole('button',{name:'重试',exact:true}).isVisible(),true);
}));
