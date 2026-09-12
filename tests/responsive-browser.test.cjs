const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('@playwright/test');
test('responsive: six required viewports, shared flows, sticky detail, desktop chat, draft-safe refresh',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:require('./browser-path.cjs')});
 const out=path.resolve(__dirname,'../test-results/responsive');fs.mkdirSync(out,{recursive:true});const results=[];
 try{const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8085');await page.waitForSelector('.task-card');
 for(const [width,height] of [[375,812],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>go('home'));
  const check=async(name)=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${name}: overflow`);await page.screenshot({path:path.join(out,`${width}-${name}.png`),fullPage:true});results.push({width,height,page:name,overflow:false});};
  assert.equal(await page.locator('.bottom-nav').isVisible(),width<768);assert.equal(await page.locator('.desktop-nav').isVisible(),width>=768);assert.equal(await page.locator('.home-aside').isVisible(),width>=1200);
  await check('home');await page.locator('#homeSearch').fill('南屿');await page.waitForTimeout(350);assert.equal(await page.locator('#taskList .task-card').count(),1);await page.locator('#homeSearch').fill('');await page.waitForTimeout(350);
  await page.locator('.tool-select').selectOption('price');assert.equal(await page.locator('#taskList .task-title').first().innerText(),'小红书笔记排版 8 篇');
  await page.evaluate(()=>openTask('demo-2'));await check('detail');
  if(width>=768){assert.equal(await page.locator('.detail-action').evaluate(e=>getComputedStyle(e).position),'sticky');await page.getByRole('button',{name:'联系商家',exact:true}).click();await page.waitForSelector('#authEmail');await page.evaluate(()=>closeModal());}
  await page.evaluate(()=>go('publish'));await page.waitForSelector('#authEmail');await page.evaluate(()=>closeModal());assert.equal(await page.evaluate(()=>state.route),'detail');
  await page.evaluate(()=>go('messages'));await page.waitForSelector('#authEmail');await page.evaluate(()=>closeModal());await page.evaluate(()=>go('profile'));await check('profile-guest');
 }
 await page.setViewportSize({width:1440,height:900});await page.evaluate(async()=>{await demoLogin('worker');state.advancedFilters={...FILTER_DEFAULTS};state.query='';go('publish');});await page.locator('#pTitle').fill('保留表单草稿');await page.evaluate(()=>H.refreshLive());await page.waitForTimeout(400);assert.equal(await page.locator('#pTitle').inputValue(),'保留表单草稿');await page.evaluate(()=>go('home'));
 await page.locator('.desktop-filters button').filter({hasText:/^线上$/}).click();assert.equal(await page.locator('#taskList .task-card').count(),3);
 await page.locator('#desktopSalaryMin').fill('175');await page.locator('#desktopSalaryMax').fill('200');await page.getByRole('button',{name:'应用薪资',exact:true}).click();assert.equal(await page.locator('#taskList .task-card').count(),1);
 await page.evaluate(()=>applyTask('demo-2'));await page.waitForFunction(()=>state.applications.length===1);
 await page.evaluate(async()=>{await demoLogin('merchant');await H.services.application.transition(state.applications[0].id,'accepted');await loadData();await openChat(state.applications[0].id);});
 assert.equal(await page.locator('.chat-sidebar').isVisible(),true);await page.locator('#chatText').fill('桌面消息测试');await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>state.messages.some(m=>m.content==='桌面消息测试'));await page.locator('#chatText').fill('不要丢失的聊天草稿');await page.evaluate(()=>H.refreshLive());await page.waitForTimeout(500);assert.equal(await page.locator('#chatText').inputValue(),'不要丢失的聊天草稿');
 await page.screenshot({path:path.join(out,'1440-chat.png'),fullPage:true});await page.setViewportSize({width:375,height:812});assert.equal(await page.locator('.chat-sidebar').isVisible(),false);assert.equal(await page.locator('#chatText').inputValue(),'不要丢失的聊天草稿');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'375-chat.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>go('profile'));await page.getByRole('button',{name:'报名管理',exact:false}).click();assert.match(await page.locator('.profile-content').innerText(),/淘宝主图/);await page.screenshot({path:path.join(out,'1440-profile.png'),fullPage:true});
 for(const [width,height]of [[375,812],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>go('profile'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} authenticated profile`);await page.screenshot({path:path.join(out,`${width}-profile-member.png`),fullPage:true});
  await page.evaluate(()=>openChat(state.applications[0].id));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} active chat`);assert.equal(await page.locator('.chat-sidebar').isVisible(),width>=768);await page.screenshot({path:path.join(out,`${width}-chat-member.png`),fullPage:true});results.push({width,height,page:'profile-member/chat-member',overflow:false});
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'viewports.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();}
});
