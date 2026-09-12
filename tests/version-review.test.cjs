/* Independent v0.5.1 regressions. Run only this file against the running app:
 * node --test tests/version-review.test.cjs
 * PowerShell stability run (zero retries):
 * $env:HUODA_REVIEW_REPEATS='10'; node --test tests/version-review.test.cjs
 * Every case owns a fresh non-persistent context / in-memory database.
 * Service-boundary fault injection controls latency/failure deterministically;
 * it does not claim live Supabase/network/physical-mobile acceptance.
 * Write scope is this file only, so failures emit DOM + event diagnostics to TAP,
 * rather than writing screenshots/traces to other workspace paths.
 */
'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const makeCloudFixture=require('./cloud-fixture.cjs');
const BASE=process.env.HUODA_REVIEW_URL||'http://127.0.0.1:8085';
const repeats=Number(process.env.HUODA_REVIEW_REPEATS||1);
assert.ok(Number.isInteger(repeats)&&repeats>=1&&repeats<=100,'Invalid HUODA_REVIEW_REPEATS');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:require('./browser-path.cjs')});});
after(async()=>{await browser?.close();});

async function inPage(t,body){
 const context=await browser.newContext({viewport:{width:375,height:812}});
 const page=await context.newPage(),events=[],errors=[];
 page.on('pageerror',e=>{errors.push(e.message);events.push({type:'pageerror',message:e.message});});
 page.on('console',m=>{if(m.type()==='error')events.push({type:'console',message:m.text()});});
 page.on('requestfailed',r=>events.push({type:'network',url:r.url(),error:r.failure()?.errorText}));
 try{
  // Own the test mode even when a developer's untracked config.js changes.
  await context.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.HUODA_CONFIG={CITY:'广州'};"}));
  await page.goto(BASE);
  await page.waitForFunction(()=>typeof state!=='undefined'&&!state.loading);
  await expect(page.locator('#taskList .task-card').first()).toBeVisible();
  await body(page);
  assert.deepEqual(errors,[],'No unhandled page errors');
 }catch(error){
  t.diagnostic(JSON.stringify({events,state:await page.evaluate(()=>({route:state.route,user:state.user?.id,filters:state.advancedFilters,inboxError:state.inboxError,dom:document.body.innerText})).catch(()=>null)}));
  throw error;
 }finally{await context.close();}
}

// Explicit owned local data; no mutation of the bundled demo accounts/tasks.
async function seed(page){
 await page.evaluate(async()=>{
  const now=new Date().toISOString();
  const users=[{id:'review-worker',name:'回归求职者',role:'worker'},
   {id:'review-merchant',name:'回归商家',role:'merchant',company_name:'回归测试公司',verification_status:'verified'},
   {id:'review-other',name:'回归另一账号',role:'worker'}].map(u=>({...u,email:u.id+'@example.test',city:'广州',skills:[],active:false}));
  const task={id:'review-task',owner_id:'review-merchant',type:'online',title:'回归独立任务',price:180,price_fen:18000,price_unit:'次',pay_mode:'完工结',time_text:'明天交付',location:'线上',city:'广州',description:'隔离浏览器中的测试数据',tags:['回归'],company_name:'回归测试公司',verified:true,review_status:'approved',status:'recruiting',spots_total:2,spots_left:1,created_at:now};
  const application={id:'review-application',task_id:task.id,worker_id:'review-worker',merchant_id:'review-merchant',status:'accepted',created_at:now};
  await H.localWrite(db=>{db.users.push(...users);db.tasks.push(task);db.applications.push(application);db.favoritesByUser['review-worker']=[task.id];});
  window.__reviewLogin=async id=>{
   await H.localWrite(db=>db.users.forEach(u=>{u.active=u.id===id;}));
   const user=localDb().users.find(u=>u.id===id);state.user=user;state.profile=enrichUser(user);await loadData();render();
  };
  await window.__reviewLogin('review-worker');
 });
}

for(let run=1;run<=repeats;run++){
 const title=name=>`version-review ${run}/${repeats}: ${name}`;

 test(title('late task detail cannot take over the mobile messages route'),t=>inPage(t,async page=>{
  await seed(page);
  await page.evaluate(()=>{
   const get=H.services.task.get.bind(H.services.task),open=openTask;
   H.services.task.get=async id=>{const data=await get(id);await new Promise(resolve=>window.__releaseDetail=resolve);return data;};
   openTask=(...args)=>(window.__detailDone=open(...args));
  });
  await page.getByText('回归独立任务',{exact:true}).first().click();
  await page.waitForFunction(()=>!!window.__releaseDetail);
  await page.locator('[data-route="messages"]').click();
  await expect(page.getByRole('tab',{name:'聊天',exact:true})).toBeVisible();
  await page.evaluate(async()=>{window.__releaseDetail();await window.__detailDone;});
  await expect(page.getByRole('tab',{name:'聊天',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>state.route),'messages');
 }));

 test(title('failed favorites read cannot replace a page opened later'),t=>inPage(t,async page=>{
  await seed(page);
  await page.evaluate(()=>{
   H.services.favorite.tasks=()=>new Promise((resolve,reject)=>window.__rejectFavorites=reject);
   const original=favoritesPage;favoritesPage=(...args)=>(window.__favoritesDone=original(...args));go('favorites');
  });
  await page.waitForFunction(()=>!!window.__rejectFavorites);
  await page.locator('[data-route="messages"]').click();
  await page.evaluate(async()=>{window.__rejectFavorites(new Error('REVIEW_FAVORITES_OFFLINE'));await window.__favoritesDone;});
  await expect(page.getByRole('tab',{name:'聊天',exact:true})).toBeVisible();
  await expect(page.locator('#app')).not.toContainText('REVIEW_FAVORITES_OFFLINE');
  // Suppressing stale errors must not suppress an error for the current page.
  await page.evaluate(()=>{H.services.favorite.tasks=async()=>{throw new Error('REVIEW_CURRENT_FAVORITES_OFFLINE');};go('favorites');});
  await expect(page.locator('#app')).toContainText('REVIEW_CURRENT_FAVORITES_OFFLINE');
  await expect(page.getByRole('button',{name:'重试',exact:true})).toBeVisible();
  await page.evaluate(()=>{H.services.favorite.tasks=async()=>[];});
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.getByText('还没有可报名的收藏',{exact:true})).toBeVisible();
 }));

 test(title('previous account favorites cannot reappear after logout and login'),t=>inPage(t,async page=>{
  await seed(page);
  await page.evaluate(()=>{
   const original=H.services.favorite.tasks.bind(H.services.favorite);let once=true;
   H.services.favorite.tasks=async()=>{const data=await original();if(once){once=false;await new Promise(resolve=>window.__releaseFavorites=resolve);}return data;};
   state.route='favorites';window.__oldFavoritesDone=favoritesPage();
  });
  await page.waitForFunction(()=>!!window.__releaseFavorites);
  await page.evaluate(async()=>{await logout();await window.__reviewLogin('review-other');go('favorites');});
  await expect(page.getByText('还没有可报名的收藏',{exact:true})).toBeVisible();
  await page.evaluate(async()=>{window.__releaseFavorites();await window.__oldFavoritesDone;});
  await expect(page.getByText('还没有可报名的收藏',{exact:true})).toBeVisible();
  await expect(page.locator('#app')).not.toContainText('回归独立任务');
  assert.equal(await page.evaluate(()=>state.user.id),'review-other');
 }));

 test(title('old inbox search failure cannot erase a newer successful result'),t=>inPage(t,async page=>{
  await seed(page);
  await page.evaluate(()=>{
   go('messages');const original=H.services.inbox.list.bind(H.services.inbox);
   H.services.inbox.list=async query=>{
    if(query==='过期关键词')return new Promise((resolve,reject)=>window.__rejectOldSearch=reject);
    const data=await original(query);if(query==='回归')window.__newSearchReturned=true;return data;
   };
  });
  await page.getByRole('textbox',{name:'搜索消息'}).fill('过期关键词');
  await page.waitForFunction(()=>!!window.__rejectOldSearch);
  await page.getByRole('textbox',{name:'搜索消息'}).fill('回归');
  await page.waitForFunction(()=>window.__newSearchReturned===true);
  await expect(page.getByRole('button',{name:/回归商家.*回归独立任务/})).toBeVisible();
  await page.evaluate(()=>{window.__rejectOldSearch(new Error('REVIEW_STALE_SEARCH_OFFLINE'));});
  // A rendered frame drains the rejected request's async handlers; no timed sleeps.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await expect(page.getByRole('button',{name:/回归商家.*回归独立任务/})).toBeVisible();
  await expect(page.locator('#inboxList')).not.toContainText('REVIEW_STALE_SEARCH_OFFLINE');
  // A current failure must still be visible and recover through the retry UI.
  await page.evaluate(()=>{
   const original=H.services.inbox.list.bind(H.services.inbox);let once=true;
   H.services.inbox.list=async query=>{if(query==='回归商家'&&once){once=false;throw new Error('REVIEW_CURRENT_SEARCH_OFFLINE');}return original(query);};
  });
  await page.getByRole('textbox',{name:'搜索消息'}).fill('回归商家');
  await expect(page.locator('#inboxList')).toContainText('REVIEW_CURRENT_SEARCH_OFFLINE');
  await page.getByRole('button',{name:'重新加载',exact:true}).click();
  await expect(page.getByRole('button',{name:/回归商家.*回归独立任务/})).toBeVisible();
 }));

 test(title('successful send followed by read failure cannot resubmit the same draft'),t=>inPage(t,async page=>{
  await seed(page);await page.evaluate(()=>openChat('review-application'));
  await page.evaluate(()=>{
   const original=H.services.inbox.conversation.bind(H.services.inbox);let once=true;
   H.services.inbox.conversation=async id=>{if(once){once=false;throw new Error('REVIEW_POST_SEND_READ_OFFLINE');}return original(id);};
   const send=sendMessage;sendMessage=(...args)=>(window.__sendDone=send(...args));
  });
  await page.getByRole('textbox',{name:'聊天内容'}).fill('请确认明天集合时间');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.evaluate(()=>window.__sendDone);
  assert.equal(await page.evaluate(()=>localDb().messages.filter(m=>m.content==='请确认明天集合时间').length),1,'Write was acknowledged before the read failure');
  await expect(page.getByRole('textbox',{name:'聊天内容'})).toHaveValue('');
  await expect(page.getByText('消息已发送，记录刷新失败，请刷新会话查看。',{exact:true})).toBeVisible();
  // Re-clicking the now-empty composer must not write again.
  const sendButton=page.getByRole('button',{name:'发送',exact:true});
  if(await sendButton.isEnabled()){await sendButton.click();await page.evaluate(()=>window.__sendDone);}
  assert.equal(await page.evaluate(()=>localDb().messages.filter(m=>m.content==='请确认明天集合时间').length),1);
  await page.getByRole('button',{name:'← 消息',exact:true}).click();
  await page.getByRole('button',{name:/回归商家.*回归独立任务/}).click();
  await expect(page.locator('.chat-list .msg').filter({hasText:'请确认明天集合时间'})).toHaveCount(1);
 }));

 test(title('mobile salary cents, invalid range and cancelled filter edits preserve results'),t=>inPage(t,async page=>{
  await seed(page);
  await page.evaluate(async()=>{
   await H.localWrite(db=>{const base=db.tasks.find(t=>t.id==='review-task');for(const [suffix,fen,unit]of [['low',1,'小时'],['exact',2,'小时'],['high',3,'小时'],['other-unit',2,'次']])db.tasks.push({...base,id:'review-'+suffix,title:'边界校验 '+suffix,price:fen/100,price_fen:fen,price_unit:unit});});
   await loadData();go('home');
  });
  await page.locator('#homeSearch').fill('边界校验');
  await expect(page.locator('#taskList .task-card')).toHaveCount(4);
  await page.getByRole('button',{name:/☷.*筛选/}).click();
  const modal=page.locator('#modalRoot');
  await modal.getByRole('spinbutton',{name:'最低报酬'}).fill('0.02');
  await modal.getByRole('spinbutton',{name:'最高报酬'}).fill('0.02');
  await modal.getByRole('combobox',{name:'报酬计价单位'}).selectOption('小时');
  await modal.getByRole('button',{name:'查看结果',exact:true}).click();
  await expect(page.locator('#taskList .task-card')).toHaveCount(1);
  await expect(page.locator('#taskList')).toContainText('边界校验 exact');
  await page.getByRole('button',{name:/☷.*筛选/}).click();
  await modal.getByRole('spinbutton',{name:'最低报酬'}).fill('0.03');
  await modal.getByRole('button',{name:'查看结果',exact:true}).click();
  await expect(page.getByText('请输入有效报酬范围，最低不能高于最高',{exact:true})).toBeVisible();
  await expect(modal.getByRole('button',{name:'取消',exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('#taskList .task-card')).toHaveCount(1);
  await page.getByRole('button',{name:/☷.*筛选/}).click();
  await expect(modal.getByRole('spinbutton',{name:'最低报酬'})).toHaveValue('0.02');
  await modal.getByRole('button',{name:'重置',exact:true}).click();
  await modal.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('#taskList .task-card')).toHaveCount(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }));

 test(title('SQL permission gaps: third-party read markers, forged messages, immutable submitted evidence'),async()=>{
  const fixture=await makeCloudFixture();
  try{await fixture.admin(async db=>{
   const {worker,merchant,admin}=fixture.ids;
   const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id]);await db.exec('set role authenticated');};
   const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
   const taskId=await scalar("select id from public.tasks where owner_id=$1 and status='recruiting' and review_status='approved' limit 1",[merchant]);
   assert.ok(taskId);
   await as(worker);const application=await scalar('select to_jsonb(public.apply_to_task($1))',[taskId]);
   await as(merchant);await db.query('select public.accept_application($1)',[application.id]);
   await db.query("select public.send_text_message($1,'permission-review-message')",[application.id]);
   await as(admin); // Authenticated third party; table membership is not chat permission.
   await assert.rejects(db.query('select public.mark_conversation_read($1)',[application.id]),/FORBIDDEN|CHAT_UNAVAILABLE/);
   assert.equal(Number(await scalar('select count(*) from public.messages where application_id=$1',[application.id])),0);
   await as(worker);
   assert.equal(Number(await scalar("select count(*) from public.messages where application_id=$1 and content='permission-review-message' and read_at is null",[application.id])),1);
   await assert.rejects(db.query("insert into public.messages(application_id,sender_id,content,message_type) values($1,$2,'伪造平台通知','system')",[application.id,merchant]),/permission denied|row-level security/);
   await assert.rejects(db.query('update public.messages set read_at=now() where application_id=$1',[application.id]),/permission denied/);
   const file=worker+'/review-evidence.png';
   await db.query("insert into storage.objects(bucket_id,name) values('merchant-verification',$1)",[file]);
   await db.query("select public.submit_merchant_verification('独立回归公司','914401010000000001',$1)",[file]);
   assert.equal((await db.query("update storage.objects set name=$1 where bucket_id='merchant-verification' and name=$2 returning name",[worker+'/replaced.png',file])).rows.length,0);
   assert.equal((await db.query("delete from storage.objects where bucket_id='merchant-verification' and name=$1 returning name",[file])).rows.length,0);
   assert.equal(Number(await scalar("select count(*) from storage.objects where name=$1",[file])),1);
   await db.query("select public.transition_application($1,'cancelled')",[application.id]);
   assert.equal(Number(await scalar("select count(*) from public.messages where application_id=$1 and content='permission-review-message'",[application.id])),1,'Cancelled participant retains history');
   await assert.rejects(db.query("select public.send_text_message($1,'结束后继续发送')",[application.id]),/CHAT_UNAVAILABLE/);
  });}finally{await fixture.close();}
 });

 test(title('cloud notification response cannot expose account A notices to account B'),async t=>{
  const fixture=await makeCloudFixture(),context=await browser.newContext({viewport:{width:375,height:812}});
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  try{
   await fixture.attach(context);const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(BASE);await page.waitForFunction(()=>!state.loading);
   const login=async role=>{
    await page.evaluate(async role=>{const {error}=await sb.auth.signInWithPassword({email:role+'@huoda.test',password:'fixture-password'});if(error)throw error;},role);
    await page.waitForFunction(id=>state.user?.id===id&&state.profile?.id===id,fixture.ids[role]);
    await page.evaluate(()=>loadData());
   };
   await login('worker');
   // The real SDK GET is delayed outside the fixture's SQL queue so B can log in.
   // Only this owned response is simulated; Auth uses the existing SDK fixture.
   const started=page.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/rest/v1/notifications');let once=true;
   await context.route('https://huoda-fixture.supabase.co/rest/v1/notifications?**',async route=>{
    if(!once||route.request().method()!=='GET')return route.fallback();
    once=false;await gate;
    await route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'review-private-notice',user_id:fixture.ids.worker,type:'moderation',title:'A账号私有审核结果',body:'仅A账号可见的举报处理详情',data:{},read_at:null,created_at:new Date().toISOString()}])});
   });
    await page.evaluate(()=>{state.route='messages';state.messageTab='notices';messagesPage();window.__oldNotificationRefresh=refreshMessages();});
   await started;
   await page.evaluate(async()=>{const {error}=await sb.auth.signOut();if(error)throw error;});
   await page.waitForFunction(()=>state.user===null);
   await login('merchant');
   release();await page.evaluate(()=>window.__oldNotificationRefresh);
   await page.getByRole('tab',{name:'通知',exact:true}).click();
   const snapshot=await page.evaluate(()=>({user:state.user?.id,notifications:state.notifications,visible:app.innerText}));
   t.diagnostic(JSON.stringify(snapshot));
   assert.equal(snapshot.user,fixture.ids.merchant);
   assert.equal(snapshot.notifications.some(n=>n.user_id!==fixture.ids.merchant),false,'No stale private data in the new session');
   await expect(page.locator('#app')).not.toContainText('A账号私有审核结果');
   await expect(page.locator('#app')).not.toContainText('仅A账号可见的举报处理详情');
   assert.deepEqual(errors,[]);
  }finally{release();await context.close();await fixture.close();}
 });
}
