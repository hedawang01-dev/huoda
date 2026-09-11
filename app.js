const CFG = window.HUODA_CONFIG || window.FINDWORK_CONFIG || {};
const CLOUD_REQUESTED = Boolean(CFG.SUPABASE_URL || CFG.SUPABASE_KEY);
let CLOUD_ENABLED = false;
let sb = null;

async function ensureCloudClient(){
  if(!CLOUD_REQUESTED)return;
  if(!CFG.SUPABASE_URL||!CFG.SUPABASE_KEY)throw new Error('云端配置尚未填完整，请同时填写项目 URL 和公开 key。未切换本地演示。');
  if(!window.supabase?.createClient){
    try{
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='vendor/supabase-2.57.4.js';
        script.onload=resolve; script.onerror=()=>reject(new Error('Supabase JS 加载失败'));
        document.head.appendChild(script);
        setTimeout(()=>reject(new Error('Supabase JS 加载超时')),8000);
      });
    }catch(e){throw new Error('云端组件加载失败，请检查网络后刷新。未切换演示数据。')}
  }
  if(window.supabase?.createClient){sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY);CLOUD_ENABLED=true}
}
const app = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');
const LS_KEY = 'huoda_mvp_v050';
const OLD_LS_KEY = 'huoda_v050_no_legacy_import';
const FAV_KEY = 'huoda_favorites_v050_guest';

const seedTasks = [
  {id:'demo-1',type:'offline',category:'活动执行',title:'琶洲展会协助｜4小时',price:120,price_unit:'次',settlement:'完工后2小时内',pay_mode:'日结',time_text:'今天 14:00-18:00',location:'广州·海珠区·琶洲',lat:23.1043,lng:113.3847,tags:['日结','无需经验'],company_name:'广马会展服务',description:'协助展台物料摆放、现场引导和简单收尾。穿黑色长裤、运动鞋即可。\n\n到场后按负责人指引签到，工作结束后现场确认工时。',spots_total:5,spots_left:3,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-demo',created_at:Date.now()-3600000},
  {id:'demo-2',type:'online',category:'设计',title:'淘宝主图精修 5 张',price:180,price_unit:'单',settlement:'验收后确认完成',pay_mode:'完工结',time_text:'24小时内交付',location:'线上',lat:null,lng:null,tags:['PS','电商设计'],company_name:'南屿电商',description:'提供产品原图和参考样式，要求完成基础精修、光影统一与版式优化。\n\n交付 JPG + 可编辑源文件，修改不超过 2 轮。',spots_total:1,spots_left:1,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-demo',created_at:Date.now()-2500000},
  {id:'demo-3',type:'offline',category:'门店兼职',title:'咖啡店晚班兼职',price:25,price_unit:'小时',settlement:'每周一结算',pay_mode:'周结',time_text:'今晚 18:00-22:00',location:'广州·天河区·体育西',lat:23.1325,lng:113.3213,tags:['晚班','可长期'],company_name:'木森咖啡',description:'负责简单饮品辅助、收桌、打包与门店清洁。有服务业经验优先，没有经验可现场教学。',spots_total:2,spots_left:2,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-2',created_at:Date.now()-7200000},
  {id:'demo-4',type:'online',category:'视频',title:'短视频粗剪｜3条',price:150,price_unit:'单',settlement:'验收后结算',pay_mode:'完工结',time_text:'今晚可做',location:'线上',lat:null,lng:null,tags:['剪映','短视频'],company_name:'栖木传媒',description:'素材已整理，每条 30-60 秒，按脚本完成粗剪、字幕和基础转场。无需包装特效。',spots_total:2,spots_left:2,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-3',created_at:Date.now()-5400000},
  {id:'demo-5',type:'offline',category:'商超零工',title:'商场理货补货｜6小时',price:168,price_unit:'次',settlement:'次日中午前结算',pay_mode:'日结',time_text:'明天 10:00-16:00',location:'广州·越秀区·北京路',lat:23.1259,lng:113.2709,tags:['日结','体力活'],company_name:'禾仓零售服务',description:'协助商品上架、补货、纸箱整理。需要能连续站立工作，现场提供工作手套。',spots_total:4,spots_left:4,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-4',created_at:Date.now()-8600000},
  {id:'demo-6',type:'online',category:'运营',title:'小红书笔记排版 8 篇',price:240,price_unit:'单',settlement:'交付通过后结算',pay_mode:'完工结',time_text:'2天内交付',location:'线上',lat:null,lng:null,tags:['小红书','排版','运营'],company_name:'白鲸工作室',description:'文案和图片素材由商家提供，负责封面统一、正文图片排版和基础发布格式整理。',spots_total:1,spots_left:1,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-5',created_at:Date.now()-9600000},
  {id:'demo-7',type:'offline',category:'门店兼职',title:'周末书店整理员｜白班',price:22,price_unit:'小时',settlement:'每月 10 日统一结算',pay_mode:'月结',time_text:'周六日 10:00-18:00',location:'广州·天河区·珠江新城',lat:23.1192,lng:113.3267,tags:['周末','白班','可长期'],company_name:'拾页书店',description:'负责图书归位、简单陈列、顾客指引和闭店前整理。适合希望固定周末兼职的人群。',spots_total:3,spots_left:2,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-6',created_at:Date.now()-10800000},
  {id:'demo-8',type:'offline',category:'仓储兼职',title:'仓库分拣白班｜8小时',price:208,price_unit:'次',settlement:'每周五结算',pay_mode:'周结',time_text:'工作日 09:00-18:00',location:'广州·白云区·嘉禾望岗',lat:23.2378,lng:113.2898,tags:['白班','周结','无需经验'],company_name:'迅仓供应链',description:'按区域完成轻小件分拣、扫码和装筐，现场培训后上岗。需要能连续站立工作。',spots_total:6,spots_left:5,status:'open',review_status:'approved',risk_level:'low',verified:true,owner_id:'merchant-7',created_at:Date.now()-12600000}
];

const FILTER_DEFAULTS = {workType:'全部',payMode:'全部',shift:'全部',distance:'全部',minPrice:'',maxPrice:'',priceUnit:'全部'};

const state = {
  route:'home', filter:'全部', query:'', sort:'recommend', selectedTask:null,
  advancedFilters:{...FILTER_DEFAULTS}, filterDraft:{...FILTER_DEFAULTS},
  selectedApplication:null, publishTab:'new', orderTab:'worker', adminTab:'verify',
  user:null, profile:null, tasks:[], applications:[], messages:[], reports:[],
  inbox:[], inboxQuery:'', inboxFilter:'all', messageTab:'chats', chatUnread:0, noticeUnread:0, location:null, favorites:loadFavorites(), notifications:[], reviews:[], ownTasks:[], feedTotal:0, nextCursor:null, feedLoading:false, loading:true
};


function loadFavorites(){
  try{return JSON.parse(localStorage.getItem(FAV_KEY)||'[]').filter(x=>typeof x==='string').slice(0,500).map(String)}catch(_e){return []}
}
function saveFavorites(){localStorage.setItem(FAV_KEY,JSON.stringify(state.favorites||[]))}
function isFavorite(id){return (state.favorites||[]).includes(String(id))}
async function toggleFavorite(event,id){event?.stopPropagation?.();try{const added=await H.services.favorite.toggle(String(id));toast(added?'已收藏，稍后可以再看':'已取消收藏');if(state.route==='favorites')await favoritesPage();else if(state.route==='home')refreshHomeResults();else render();}catch(e){toast(H.errorText(e));}}

function makeDb(){return {tasks:seedTasks,applications:[],users:[],messages:[],reports:[],verificationRequests:[],notifications:[],reviews:[],audit_logs:[],favoritesByUser:{}}}
function localDb(){
  const raw=localStorage.getItem(LS_KEY);
  if(raw){
    try{return normalizeDb(JSON.parse(raw))}catch(_e){}
  }
  const old=localStorage.getItem(OLD_LS_KEY);
  if(old){
    try{
      const legacy=JSON.parse(old);
      const db=normalizeDb({...makeDb(),...legacy,tasks:(legacy.tasks||[]).map(enrichLegacyTask)});
      localStorage.setItem(LS_KEY,JSON.stringify(db));
      return db;
    }catch(_e){}
  }
  const db=makeDb(); localStorage.setItem(LS_KEY,JSON.stringify(db)); return db;
}
function normalizeDb(db){
  const current=(db.tasks||[]).map(enrichLegacyTask);
  const ids=new Set(current.map(t=>String(t.id)));
  seedTasks.forEach(t=>{if(!ids.has(String(t.id)))current.push(enrichLegacyTask(t))});
  db.tasks=current.length?current:seedTasks.map(enrichLegacyTask); db.applications=db.applications||[]; db.users=(db.users||[]).map(enrichUser);
  db.messages=db.messages||[]; db.reports=db.reports||[]; db.verificationRequests=db.verificationRequests||[]; db.notifications??=[];db.reviews??=[];db.audit_logs??=[];db.favoritesByUser??={};return db;
}
function enrichLegacyTask(t){return {...H.task(t),city:t.city||'广州',category:t.category||((t.tags||[])[0]||'兼职'),review_status:t.review_status||'approved',risk_level:t.risk_level||'low',lat:t.lat??null,lng:t.lng??null}}
function enrichUser(u){return {...u,verification_status:u.verification_status||(u.verified?'verified':'unverified'),company_name:u.company_name||'',credit_code:u.credit_code||'',license_file_name:u.license_file_name||''}}
function saveLocal(db){localStorage.setItem(LS_KEY,JSON.stringify(normalizeDb(db)))}
function uid(prefix='id'){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function priceLabel(t){const value=Number(t.price_fen??Math.round(Number(t.price)*100))/100;return `¥${value.toLocaleString('zh-CN',{maximumFractionDigits:2})}${t.price_unit==='小时'?'/小时':''}`;}

function typeLabel(t){return t.type==='online'?'线上':'线下'}
function statusLabel(s){return ({applied:'待商家确认',accepted:'已确认',completed:'已完成',rejected:'未通过',cancelled:'已取消'})[s]||s}
function statusClass(s){return s==='accepted'||s==='completed'?'ok':s==='rejected'||s==='cancelled'?'bad':'wait'}
function reviewLabel(s){return ({approved:'审核通过',pending:'待平台审核',rejected:'审核未通过'})[s]||'待审核'}
function reviewClass(s){return s==='approved'?'ok':s==='rejected'?'bad':'wait'}
function verificationLabel(s){return ({verified:'商家已认证',pending:'认证审核中',rejected:'认证未通过',unverified:'未认证'})[s]||'未认证'}
function formatTime(v){const d=new Date(v);return Number.isNaN(d.getTime())?'':`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function getWorkerId(a){return a.worker_id}
function getMerchantId(a){return a.merchant_id}
function getTask(a){
  if(!a)return null;
  if(a.tasks)return a.tasks;
  const found=state.tasks.find(t=>String(t.id)===String(a.task_id));
  if(found)return found;
  if(!CLOUD_ENABLED)return localDb().tasks.find(t=>String(t.id)===String(a.task_id));
  return null;
}
function isOwner(t){return Boolean(state.user&&String(t.owner_id)===String(state.user.id))}
function merchantVerified(){return state.profile?.verification_status==='verified'}

async function init(){
 try{
  await ensureCloudClient();
  if(CLOUD_ENABLED){
   const {data,error}=await sb.auth.getSession();if(error)throw error;
   if(data.session?.user){await hydrateUser(data.session.user);await H.services.favorite.merge();}
   sb.auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION')return;
    const sequence=H.authEventSequence=(H.authEventSequence||0)+1;
    // Apply identity changes immediately; database reads run outside the Auth callback.
    state.user=session?.user||null;const identity=H.captureSession();
    setTimeout(async()=>{
     const current=()=>sequence===H.authEventSequence&&H.isCurrentSession(identity);
     if(!current())return;
     try{
      if(session?.user){await hydrateUser(session.user);if(!current())return;await H.services.favorite.merge();}
      else{state.profile=null;state.favorites=loadFavorites();}
      if(!current())return;
      await loadData();if(!current())return;
      H.services.message.subscribe();render();if(session)runAfterAuth();
     }catch(e){if(current())toast(H.errorText(e));}
    },0);
   });
  }
  else{const saved=localDb().users.find(u=>u.active);if(saved){state.user=saved;state.profile=enrichUser(saved);await H.services.favorite.merge();}}
  await loadData();state.loading=false;H.services.message.subscribe();render();
 }catch(e){state.loading=false;app.innerHTML=`<section class="section"><div class="empty-box"><b>暂时无法连接服务</b><p>${esc(H.errorText(e))}</p><button class="primary" onclick="location.reload()">重新连接</button></div></section>`;}
}

async function hydrateUser(user){return H.services.auth.hydrate(user);}

async function loadData(){
 const session=H.captureSession(),request=H.dataRequest=(H.dataRequest||0)+1;
 const current=()=>H.isCurrentSession(session)&&request===H.dataRequest;
 if(CLOUD_ENABLED){
  if(state.user)await hydrateUser(state.user);
  if(!current())return false;
  if(!['messages','chat','notifications'].includes(state.route))await reloadFeed(false);
  if(!current())return false;
  if(state.user){
   const id=state.user.id;
   const [a,r,n,rv,own,unread]=await Promise.all([
    sb.from('applications').select('*,tasks(*)').order('created_at',{ascending:false}),
    sb.from('reports').select('*').eq('reporter_id',id).order('created_at',{ascending:false}),
    sb.from('notifications').select('*').eq('user_id',id).order('created_at',{ascending:false}).limit(100),
    sb.from('reviews').select('*').eq('reviewer_id',id),
    sb.from('tasks').select('*').eq('owner_id',id).order('created_at',{ascending:false}),
    sb.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',id).is('read_at',null)
   ]);
   if(!current())return false;
   const snapshot={applications:H.unwrap(a)||[],reports:H.unwrap(r)||[],notifications:H.unwrap(n)||[],reviews:H.unwrap(rv)||[],ownTasks:(H.unwrap(own)||[]).map(H.task),unreadCount:unread.count||0};H.unwrap(unread);
   // Do not download every conversation on unrelated pages. The active chat
   // loads its own history through inbox.conversation.
   snapshot.favorites=await H.services.favorite.list();
   if(!current())return false;
   Object.assign(state,snapshot);
  }else{state.applications=[];state.reports=[];state.messages=[];state.notifications=[];state.reviews=[];state.ownTasks=[];state.unreadCount=0;}
 }else{
  const db=localDb();state.tasks=db.tasks.map(H.task);state.ownTasks=state.tasks.filter(t=>t.owner_id===state.user?.id);state.applications=db.applications.filter(a=>state.user&&[a.worker_id,a.merchant_id].includes(state.user.id));const ids=new Set(state.applications.map(a=>a.id));state.messages=db.messages.filter(m=>ids.has(m.application_id));state.reports=db.reports.filter(r=>r.reporter_id===state.user?.id);state.notifications=db.notifications.filter(n=>n.user_id===state.user?.id);state.reviews=db.reviews.filter(r=>r.reviewer_id===state.user?.id);state.unreadCount=state.notifications.filter(n=>!n.read_at).length;state.favorites=await H.services.favorite.list();if(state.user){const fresh=db.users.find(u=>u.id===state.user.id);if(fresh){state.user=fresh;state.profile=enrichUser(fresh);}}
 }
 if(!current())return false;
 await H.services.inbox.load();
 if(!current())return false;
 if(state.selectedApplication)state.selectedApplication=state.applications.find(a=>a.id===state.selectedApplication.id)||null;
 return true;
}
async function reloadFeed(paint=true,more=false){
 if(!CLOUD_ENABLED){if(paint)render();return;}
 const request=++H.feedRequest,session=H.captureSession();state.feedLoading=true;
 try{const data=await H.services.task.search(more?state.nextCursor||0:0);if(request!==H.feedRequest||!H.isCurrentSession(session))return;const items=data.items.map(H.task);state.tasks=more?[...new Map([...state.tasks,...items].map(t=>[t.id,t])).values()]:items;state.feedTotal=data.total;state.nextCursor=data.next_cursor;state.feedError='';}
 catch(e){if(request!==H.feedRequest||!H.isCurrentSession(session))return;state.feedError=H.errorText(e);if(!more){state.tasks=[];state.feedTotal=0;state.nextCursor=null;}if(!paint)throw e;toast(state.feedError);}
 finally{if(request===H.feedRequest){state.feedLoading=false;if(paint&&state.route==='home'){refreshHomeResults();document.querySelector('.match-section')?.remove();const center=document.querySelector('.home-center')||app;center.insertAdjacentHTML('beforeend',matchCards());center.querySelector('.match-section')?.classList.add('mobile-matches');}}}
}
async function loadMoreTasks(){if(!state.feedLoading&&state.nextCursor!==null)await reloadFeed(true,true);}

function render(){
  saveVisibleDrafts();
  if(!state.loading&&!uxRouteReady){uxRouteReady=true;if(location.hash){restoreLocation();return;}}
  if(!state.loading)syncLocation();
  updateHeader();
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route||(b.dataset.route==='messages'&&['chat','notifications'].includes(state.route))));
  if(state.loading){app.innerHTML='<div class="skeleton-page"><div class="skeleton h"></div><div class="skeleton"></div><div class="skeleton"></div></div>';return}
  const routes={home,publish,orders,profile,favorites:favoritesPage,detail:()=>detail(state.selectedTask),chat,admin,messages:messagesPage,notifications:notificationsPage,publicProfile:publicProfilePage};
  (routes[state.route]||home)();
  H.layout?.();
}

function updateHeader(){
  H.updateDesktopHeader?.();
  document.querySelector('.app-shell').classList.toggle('inbox-shell',['messages','chat','notifications'].includes(state.route));
  const total=(state.chatUnread||0)+(state.noticeUnread||0),badge=document.getElementById('messageNavBadge');if(badge){badge.hidden=!total;badge.textContent=total>99?'99+':total;}const nav=document.querySelector('[data-route="messages"]');if(nav)nav.setAttribute('aria-label',`消息${total?`，${total}条未读`:''}`);

  const bell=document.getElementById('notificationBtn');if(bell){bell.innerHTML=`♧${total?`<span class="unread-badge">${total>99?'99+':total}</span>`:''}`;bell.setAttribute('aria-label',`通知中心，${state.noticeUnread||0}条未读`);}const hint=document.getElementById('modeHint');const btn=document.getElementById('accountBtn');const city=document.getElementById('cityBtn');
  hint.textContent=CLOUD_ENABLED?'云端账户 · 手机与电脑共用数据':'本地演示 · 仅当前浏览器保存，不跨设备同步';
  btn.textContent=(state.profile?.name||'游客').slice(0,1);
  city.textContent=`${state.profile?.city||CFG.CITY||'广州'} ▾`;
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function distanceKm(t){return H.services.location.distance(t,state.location);}

function distanceLabel(t){if(t.type==='online')return '线上';const d=distanceKm(t);if(d==null)return t.location;return d<1?`距你 ${Math.max(100,Math.round(d*1000/100)*100)}m`:`距你 ${d.toFixed(d<10?1:0)}km`}
function matchScore(t){return H.services.recommendation.score(t,state.profile,state.location);}

function searchable(t){return [t.title,t.category,t.location,t.company_name,t.description,...(t.tags||[])].join(' ').toLowerCase()}
function taskMatchesShift(t,shift){
  if(shift==='全部')return true;
  const tags=t.tags||[], text=`${t.time_text||''} ${t.title||''}`;
  if(tags.includes(shift))return true;
  if(shift==='晚班')return /晚班|今晚|夜班|18:|19:|20:|21:|22:|23:/.test(text);
  if(shift==='白班')return /白班|上午|下午|09:|10:|11:|12:|13:|14:|15:|16:|17:/.test(text);
  if(shift==='周末')return /周末|周六|周日|星期六|星期日/.test(text);
  return false;
}
function activeAdvancedFilterCount(){
  return Object.entries(state.advancedFilters||{}).filter(([k,v])=>v!==FILTER_DEFAULTS[k]).length;
}
function filteredTasks(){
  if(CLOUD_ENABLED)return state.tasks;let list=state.tasks.filter(t=>t.status==='open'&&t.review_status==='approved'&&t.spots_left>0);
  if(state.filter==='线下')list=list.filter(t=>t.type==='offline');
  else if(state.filter==='线上')list=list.filter(t=>t.type==='online');
  else if(state.filter!=='全部')list=list.filter(t=>(t.tags||[]).includes(state.filter)||t.pay_mode===state.filter||t.category===state.filter);

  const af=state.advancedFilters||FILTER_DEFAULTS;
  if(af.minPrice!=='')list=list.filter(t=>t.price_fen>=Math.round(Number(af.minPrice)*100));
  if(af.maxPrice!=='')list=list.filter(t=>t.price_fen<=Math.round(Number(af.maxPrice)*100));
  if(af.priceUnit!=='全部')list=list.filter(t=>t.price_unit===af.priceUnit);
  if(af.workType==='线下')list=list.filter(t=>t.type==='offline');
  else if(af.workType==='线上')list=list.filter(t=>t.type==='online');
  if(af.payMode!=='全部')list=list.filter(t=>t.pay_mode===af.payMode||(t.tags||[]).includes(af.payMode));
  if(af.shift!=='全部')list=list.filter(t=>taskMatchesShift(t,af.shift));
  if(af.distance!=='全部'){
    const max=Number(af.distance);
    list=list.filter(t=>t.type==='offline'&&distanceKm(t)!=null&&distanceKm(t)<=max);
  }

  const q=state.query.trim().toLowerCase();if(q)list=list.filter(t=>searchable(t).includes(q));
  return list.sort((a,b)=>{
    if(state.sort==='distance'){const ad=distanceKm(a)??99999,bd=distanceKm(b)??99999;return ad-bd}
    if(state.sort==='price')return Number(b.price)-Number(a.price);
    if(state.sort==='newest')return new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
    return matchScore(b)-matchScore(a);
  });
}

function taskCard(t){
  const dist=distanceLabel(t), score=matchScore(t), fav=isFavorite(t.id);
  const tags=(t.tags||[]).filter(x=>x!==t.pay_mode).slice(0,2);
  return `<article class="task-card" tabindex="0" role="link" aria-label="查看任务：${esc(t.title)}" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openTask('${esc(t.id)}')}" onclick="openTask('${esc(t.id)}')">
    <div class="task-headline"><div class="task-title">${esc(t.title)}</div><button class="favorite-btn ${fav?'active':''}" onclick="toggleFavorite(event,'${esc(t.id)}')" aria-label="${fav?'取消收藏':'收藏任务'}">${fav?'♥':'♡'}</button></div>
    <div class="task-pay-row"><div class="price">${priceLabel(t)}</div><span class="pay-chip">${esc(t.pay_mode||'待确认')}</span>${state.profile?.skills?.length?`<span class="match-inline">匹配 ${score} 分</span>`:''}</div>
    <div class="task-essential"><div><span>时间</span><b>${esc(t.time_text)}</b></div><div><span>地点</span><b class="distance">${esc(dist)}</b></div></div>
    <div class="desktop-task-meta"><span>${esc(t.company_name||'商家')}</span><span>剩余 ${Number(t.spots_left)||0} 个名额</span></div>
    <div class="task-foot"><div class="task-tags">${tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><span class="verified-mini">${t.verified?'✓ 商家已认证':'认证待核验'}</span></div>
  </article>`;
}

function matchCards(){
  if(!state.profile?.skills?.length)return '';
  const top=state.tasks.filter(t=>t.status==='open'&&t.review_status==='approved'&&t.spots_left>0).sort((a,b)=>matchScore(b)-matchScore(a)).slice(0,3);
  if(!top.length)return '';
  return `<section class="match-section"><div class="match-section-head"><div class="match-title-wrap"><span class="match-title-icon">✦</span><div><div class="match-title-line"><h3>为你匹配</h3><span class="match-ai-pill">规则推荐</span></div><p>根据技能、距离和发布时间推荐</p></div></div><span class="match-skill-hint">${esc(state.profile.skills.slice(0,2).join(' / '))}</span></div><div class="match-strip">${top.map(t=>`<div class="match-card" onclick="openTask('${esc(t.id)}')"><div class="match-head"><b>${esc(t.title)}</b><span class="match-score">${matchScore(t)} 分</span></div><div class="muted">${esc(distanceLabel(t))} · ${esc(t.time_text)}</div><div class="match-price">${priceLabel(t)}</div></div>`).join('')}</div></section>`;
}

function feedContext(list){
  const city=state.profile?.city||CFG.CITY||'广州';
  if(state.location){
    const radius=state.advancedFilters?.distance!=='全部'?`${state.advancedFilters.distance}km内`:(state.filter==='线下'?'附近':'已定位');
    return {place:`${state.location.label} · ${radius}`,count:CLOUD_ENABLED?state.feedTotal:list.length,sub:'已按当前位置与筛选条件展示'};
  }
  if(state.filter==='线下')return {place:city,count:CLOUD_ENABLED?state.feedTotal:list.length,sub:'线下兼职 · 开启定位可查看真实距离'};
  return {place:city,count:CLOUD_ENABLED?state.feedTotal:list.length,sub:'已按当前条件筛选'};
}

function feedStatusMarkup(ctx){
  return `<div class="feed-status-top"><span class="feed-location-icon">◎</span><b>${esc(ctx.place)}</b><span class="feed-count">${ctx.count} 个兼职</span></div><small>${esc(ctx.sub)}</small>`;
}

function home(){
  const list=filteredTasks(), filterCount=activeAdvancedFilterCount(), ctx=feedContext(list);
  app.innerHTML=`<section class="hero"><div class="hero-card"><div class="hero-kicker">HUODA · FLEXIBLE WORK</div><h2>有空就接，有活就搭。</h2><p>附近兼职 + 线上技能单，一个地方都能找。</p><div class="hero-badge">✓ 工价 · 时间 · 结算先看清</div></div>
  <div class="quick-grid"><button class="quick ${state.filter==='线下'?'hot':''}" onclick="setFilter('线下')" aria-pressed="${state.filter==='线下'}"><strong>◎</strong>附近</button><button class="quick ${state.filter==='线上'?'hot':''}" onclick="setFilter('线上')" aria-pressed="${state.filter==='线上'}"><strong>⌘</strong>线上</button><button class="quick ${state.filter==='日结'?'hot':''}" onclick="setFilter('日结')" aria-pressed="${state.filter==='日结'}"><strong>¥</strong>日结</button><button class="quick ${state.filter==='晚班'?'hot':''}" onclick="setFilter('晚班')" aria-pressed="${state.filter==='晚班'}"><strong>◐</strong>晚班</button></div></section>
  <section class="section task-feed">
    <div class="feed-tools">
      <div class="feed-status">${feedStatusMarkup(ctx)}</div>
      <div class="feed-tools-right">
        <button class="tool-pill ${filterCount?'active':''}" onclick="showAdvancedFilters()"><span>☷</span>筛选${filterCount?` · ${filterCount}`:''}</button>
        <select class="sort-select tool-select" onchange="setSort(this.value)" aria-label="任务排序"><option value="recommend" ${state.sort==='recommend'?'selected':''}>推荐排序</option><option value="distance" ${state.sort==='distance'?'selected':''}>距离最近</option><option value="price" ${state.sort==='price'?'selected':''}>工价优先</option><option value="newest" ${state.sort==='newest'?'selected':''}>最新发布</option></select>
      </div>
    </div>
    <div class="task-list" id="taskList">${list.length?list.map(taskCard).join(''):'<div class="empty">暂时没有符合条件的活，换个条件试试。</div>'}</div>
  </section>
  ${matchCards()}`;updateFeedPager();H.layoutHome?.();
}

function refreshHomeResults(){
  if(state.route!=='home')return;
  const list=filteredTasks(),box=document.getElementById('taskList');
  if(box)box.innerHTML=list.length?list.map(taskCard).join(''):'<div class="empty">暂时没有符合条件的活，换个条件试试。</div>';
  const status=document.querySelector('.feed-status');
  if(status){const ctx=feedContext(list);status.innerHTML=feedStatusMarkup(ctx)}
  updateFeedPager();
  H.refreshHomeAside?.();
}
function searchNow(v){state.query=v;document.getElementById('navSearchClear').hidden=!v;clearTimeout(H.searchTimer);H.searchTimer=setTimeout(()=>{if(state.route==='home'){if(CLOUD_ENABLED)reloadFeed();else refreshHomeResults();}},280);}
function submitNavSearch(event){event?.preventDefault();clearTimeout(H.searchTimer);state.query=document.getElementById('homeSearch').value.trim();go('home');if(CLOUD_ENABLED)reloadFeed();}
function clearSearch(){clearTimeout(H.searchTimer);state.query='';const input=document.getElementById('homeSearch');input.value='';document.getElementById('navSearchClear').hidden=true;if(state.route==='home'){if(CLOUD_ENABLED)reloadFeed();else refreshHomeResults();}input.focus();}
function setSort(v){if(v==='distance'&&!state.location){showLocationPicker();return;}state.sort=v;if(CLOUD_ENABLED)reloadFeed();else refreshHomeResults();}

async function favoritesPage(){const session=H.captureSession(),navigation=uxNavigation,request=H.favoritePageSequence=(H.favoritePageSequence||0)+1;const current=()=>H.isCurrentSession(session)&&state.route==='favorites'&&navigation===uxNavigation&&request===H.favoritePageSequence;app.innerHTML='<section class="section"><div class="empty">正在读取收藏…</div></section>';try{const list=await H.services.favorite.tasks();if(!current())return;H.favoriteTasks=list;app.innerHTML=`<div class="detail-head"><button class="back" onclick="go('profile')">← 返回</button><span class="page-kicker">我的收藏</span></div><section class="section"><div class="saved-head"><div><h2>稍后再看</h2><p>${list.length} 个可报名的已收藏兼职</p></div><span class="saved-icon">♡</span></div><div class="task-list">${list.length?list.map(taskCard).join(''):'<div class="empty-box"><b>还没有可报名的收藏</b><p class="muted">已关闭的任务暂不展示。</p><button class="primary" onclick="go(&quot;home&quot;)">去找活</button></div>'}</div></section>`;}catch(e){if(!current())return;app.innerHTML=`<section class="section"><p>${esc(H.errorText(e))}</p><button class="secondary" onclick="favoritesPage()">重试</button></section>`;}}

function detail(t){
  if(!t){app.innerHTML=`<section class="section"><div class="empty-box" role="status"><b>${state.taskError?'任务暂不可查看':'正在读取任务…'}</b>${state.taskError?`<p>${esc(state.taskError)}</p><div class="btn-row"><button class="secondary" onclick="openTask(state.routeTaskId)">重新加载</button><button class="primary" onclick="go('home')">去找其他活</button></div>`:''}</div></section>`;return;}
  const applied=state.applications.find(a=>String(a.task_id)===String(t.id)&&String(getWorkerId(a))===String(state.user?.id));
  const dist=distanceLabel(t);
  app.innerHTML=`<div class="detail-head"><button class="back" onclick="backRoute('home')">← 返回</button><button class="text-btn danger" onclick="showReport('${esc(t.id)}')">举报</button></div>
  <section class="detail-card"><div class="tags"><span class="tag strong">${typeLabel(t)}</span>${(t.tags||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}<span class="tag ${reviewClass(t.review_status)==='ok'?'accent':'warn'}">${reviewLabel(t.review_status)}</span></div><h2>${esc(t.title)}</h2><div class="big-price">${priceLabel(t)}</div><div class="info-row"><span>时间</span><b>${esc(t.time_text)}</b></div><div class="info-row"><span>地点</span><b>${esc(dist)}</b></div><div class="info-row"><span>结算</span><b>${esc(t.settlement)}</b></div><div class="info-row"><span>剩余</span><b>${t.spots_left??1} 个名额</b></div></section>
  <section class="detail-card"><h3>这单要做什么</h3><p class="desc">${esc(t.description)}</p></section>
  <section class="detail-card"><div class="company"><div class="avatar">${esc((t.company_name||'商').slice(0,1))}</div><div><button class="text-btn" onclick="openPublicProfile('${esc(t.owner_id)}','merchant')"><b>${esc(t.company_name||'商家')} ›</b></button><div class="${t.verified?'company-trust':'company-review'}">${t.verified?'✓ 商家实名认证已通过':'! 商家认证状态待核验'}</div></div></div></section>
  <section class="detail-card safety-card"><h3>🛡 活搭安全提醒</h3><ul class="safety-list"><li>任何押金、保证金、培训费、入职费都不要支付。</li><li>遇到刷单、代收转账、借银行卡等要求，请立即举报。</li><li>实际工资、地点或工作内容与页面明显不符时保留聊天证据。</li></ul></section>
  <section class="section"><button class="secondary" onclick="toggleFavorite(event,'${esc(t.id)}')">${isFavorite(t.id)?'♥ 已收藏':'♡ 收藏任务'}</button></section><section class="section sticky-cta"><button class="primary accent" ${applied||isOwner(t)||t.review_status!=='approved'||t.status!=='open'||t.spots_left<1?'disabled':''} onclick="applyTask('${esc(t.id)}')">${isOwner(t)?'这是你发布的任务':t.review_status!=='approved'?'等待平台审核':applied?statusLabel(applied.status):`立即${t.type==='online'?'接单':'报名'}`}</button></section>`;
  H.layoutDetail?.(t,applied);
}

function requireLogin(next){if(state.user)return true;showAuth(next);return false}
async function applyTask(taskId){if(!requireLogin(()=>applyTask(taskId)))return;try{await H.services.application.apply(taskId);await loadData();toast('报名成功，等待商家确认');go('orders');}catch(e){toast(H.errorText(e));}}

function publish(){
  const myPosts=state.user?state.ownTasks.filter(t=>String(t.owner_id)===String(state.user.id)):[];
  app.innerHTML=`<section class="section"><div class="seg"><button class="${state.publishTab==='new'?'active':''}" onclick="setPublishTab('new')">发布一单活</button><button class="${state.publishTab==='mine'?'active':''}" onclick="setPublishTab('mine')">我发布的</button></div></section>${state.publishTab==='new'?publishForm():publishedList(myPosts)}`;
  restoreDraft(app.querySelector('.form-card'),'publish');
  if(uxPublishing)app.querySelectorAll('[onclick="createTask()"]').forEach(b=>{b.disabled=true;b.textContent='正在提交…';});
}
function publishForm(){
  const ready=merchantVerified();
  return `<section class="form-card"><div class="form-title"><div><h2>发布一单活</h2><p>工价、时间、地点和交付要求一次说清。</p></div><span class="safe-pill">0 押金规则</span></div>
  ${!state.user?'<div class="notice warn">登录后才能发布任务。</div>':state.profile?.verification_status!=='verified'?`<div class="notice warn">商家状态：${verificationLabel(state.profile?.verification_status)}。通过认证后才能正式提交任务。</div>`:'<div class="notice">✓ 商家认证已通过。新任务提交后仍会进入平台任务审核。</div>'}
  <div class="field"><label>任务类型</label><select id="pType"><option value="offline">线下兼职</option><option value="online">线上技能单</option></select></div>
  <div class="field"><label>任务标题</label><input id="pTitle" placeholder="例如：展会协助 4 小时"></div>
  <div class="inline"><div class="field"><label>报酬（元）</label><input id="pPrice" type="number" min="1" placeholder="120"></div><div class="field"><label>计价</label><select id="pUnit"><option value="次">按次</option><option value="小时">按小时</option><option value="单">按单</option></select></div></div>
  <div class="inline"><div class="field"><label>结算方式</label><select id="pPay"><option>日结</option><option>完工结</option><option>周结</option><option>月结</option></select></div><div class="field"><label>需要人数</label><input id="pSpots" type="number" min="1" value="1"></div></div>
  <div class="field"><label>时间 / 截止时间</label><input id="pTime" placeholder="今天 14:00-18:00"></div>
  <div class="field"><label>地点 / 线上</label><input id="pLocation" placeholder="广州·海珠区 / 线上"></div>
  <div class="inline"><div class="field"><label>开始时间（可选）</label><input id="pStart" type="datetime-local"></div><div class="field"><label>结束 / 截止时间（可选）</label><input id="pEnd" type="datetime-local"></div></div><div class="field"><label>工作时段</label><select id="pShift"><option value="">灵活</option><option>白班</option><option>晚班</option><option>周末</option></select></div><div class="field"><label>工作城市（线下必填）</label><input id="pCity" value="${esc(state.profile?.city||CFG.CITY||'广州')}"></div><div class="inline"><div class="field"><label>工作地点纬度 WGS84</label><input id="pLat" type="number" step="any" placeholder="23.1291"></div><div class="field"><label>经度 WGS84</label><input id="pLng" type="number" step="any" placeholder="113.2644"></div></div><p class="muted">线下任务请填写实际工作地点坐标，GCJ-02 地址需转换后使用。</p><div class="field"><label>技能 / 特征标签</label><input id="pTags" placeholder="PS, 电商设计 / 日结, 无需经验"></div>
  <div class="field"><label>工作内容与交付标准</label><textarea id="pDesc" placeholder="做什么、做到什么程度、是否自带设备、修改次数等"></textarea></div>
  <button class="primary ${ready?'accent':''}" onclick="${ready?'createTask()':'showVerification(true)'}">${ready?'提交平台审核':'先完成商家认证'}</button><p class="form-note">任务审核通过后才进入公开任务流。禁止押金、培训费、刷单和代收代付。</p></section>`;
}
function publishedList(posts){
  if(!state.user)return `<section class="section"><div class="empty-box"><b>登录后管理你发布的活</b><button class="primary" onclick="showAuth()">登录 / 注册</button></div></section>`;
  const related=state.applications.filter(a=>String(getMerchantId(a))===String(state.user.id));
  return `<section class="section"><div class="section-title"><div><h3>我发布的</h3><p>审核和报名状态都在这里</p></div><span>${posts.length} 单</span></div>${posts.length?posts.map(t=>{
    const apps=related.filter(a=>String(a.task_id)===String(t.id));return `<div class="merchant-card"><div class="merchant-head"><div><b>${esc(t.title)}</b><div class="muted">${priceLabel(t)} · ${apps.length} 人报名</div></div><span class="status ${reviewClass(t.review_status)}">${reviewLabel(t.review_status)}</span></div><button class="text-btn" onclick="editTaskDetails('${esc(t.id)}')">修改任务信息 ›</button><div class="applicant-list">${apps.length?apps.map(a=>`<div class="applicant"><div><span class="mini-avatar">人</span><div><button class="text-btn" onclick="openPublicProfile('${esc(a.worker_id)}','worker')">查看求职者档案 ›</button><small> · ${statusLabel(a.status)}</small></div></div>${a.status==='applied'?`<div class="mini-actions"><button onclick="merchantDecision('${a.id}','rejected')">拒绝</button><button class="accept" onclick="merchantDecision('${a.id}','accepted')">确认</button></div>`:`<div class="mini-actions">${a.status==='accepted'?`<button class="accept" onclick="openChat('${a.id}')">聊天</button>`:''}<span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></div>`}</div>`).join(''):'<div class="muted pad">暂时还没有人报名</div>'}</div></div>`
  }).join(''):'<div class="empty">还没有发布任务</div>'}</section>`;
}
async function createTask(){if(uxPublishing||!requireLogin(()=>createTask()))return;uxPublishing=true;saveVisibleDrafts();const session=H.captureSession(),key=draftKey('publish');app.querySelectorAll('[onclick="createTask()"]').forEach(b=>{b.disabled=true;b.textContent='正在提交…';});let created=false;try{const v=id=>document.getElementById(id)?.value.trim(),price=Number(v('pPrice')),spots=Number(v('pSpots')),online=v('pType')==='online';if(!v('pTitle')||!v('pTime')||!v('pDesc')||!v('pLocation')||!Number.isFinite(price)||price<=0||!Number.isInteger(spots)||spots<1||spots>1000)throw new Error('请完整填写任务信息，人数为 1–1000 的整数');if(!/^\d+(\.\d{1,2})?$/.test(v('pPrice')))throw new Error('金额最多保留两位小数');if(!online&&(!v('pLat')||!v('pLng')||!v('pCity')||Number(v('pLat')) < -90||Number(v('pLat'))>90||Number(v('pLng')) < -180||Number(v('pLng'))>180))throw new Error('请填写实际工作地点的城市和有效 WGS84 坐标');const start=v('pStart')?new Date(v('pStart')).toISOString():null,end=v('pEnd')?new Date(v('pEnd')).toISOString():null;if(start&&end&&end<=start)throw new Error('结束时间应晚于开始时间');const tags=(v('pTags')||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean).slice(0,8);await H.services.task.create({type:v('pType'),title:v('pTitle'),price_fen:Math.round(price*100),price,price_unit:v('pUnit'),pay_mode:v('pPay'),settlement:({日结:'完工当天结算',周结:'每周结算',月结:'每月结算',完工结:'验收后结算'})[v('pPay')],time_text:v('pTime'),location:online?'线上':v('pLocation'),city:v('pCity'),description:v('pDesc'),tags,category:tags[0]||'兼职',spots_total:spots,lat:online?null:Number(v('pLat')),lng:online?null:Number(v('pLng')),coordinate_system:online?null:'WGS84',start_at:start,end_at:end,schedule_type:start?'fixed':end?'deadline':'flexible',shift:v('pShift'),verified:true});created=true;writeDraft(key,null);const box=app.querySelector('[data-draft-key]');if(box?.dataset.draftKey===key)box.dataset.draftKey='';if(!H.isCurrentSession(session))return;if(state.route==='publish'){state.publishTab='mine';render();}await loadData();if(!H.isCurrentSession(session))return;if(state.route==='publish')render();toast('已提交平台审核');}catch(e){if(H.isCurrentSession(session))toast(created?'任务已提交，列表刷新失败，请到我发布的查看。':H.errorText(e));}finally{uxPublishing=false;app.querySelectorAll('[onclick="createTask()"]').forEach(b=>{b.disabled=false;b.textContent='提交平台审核';});}}

function orders(){
  const workerApps=state.user?state.applications.filter(a=>String(getWorkerId(a))===String(state.user.id)):[];
  const merchantApps=state.user?state.applications.filter(a=>String(getMerchantId(a))===String(state.user.id)):[];
  app.innerHTML=`<section class="section"><div class="seg"><button class="${state.orderTab==='worker'?'active':''}" onclick="setOrderTab('worker')">我的接单</button><button class="${state.orderTab==='merchant'?'active':''}" onclick="setOrderTab('merchant')">商家待确认 ${merchantApps.filter(x=>x.status==='applied').length||''}</button></div></section>${!state.user?`<section class="section"><div class="empty-box"><b>登录后查看报名、聊天和任务状态</b><button class="primary" onclick="showAuth()">登录 / 注册</button></div></section>`:state.orderTab==='worker'?workerOrders(workerApps):merchantOrders(merchantApps)}`;
}
function workerOrders(list){return `<section class="section">${list.length?list.map(a=>{const t=getTask(a);return `<div class="order-card"><div class="order-top"><div><b>${esc(t?.title||'任务')}</b><div class="muted">${t?priceLabel(t):''} · ${esc(t?.time_text||'')}</div></div><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></div><div class="timeline"><span class="${['applied','accepted','completed'].includes(a.status)?'done':''}">报名</span><i></i><span class="${['accepted','completed'].includes(a.status)?'done':''}">商家确认</span><i></i><span class="${a.status==='completed'?'done':''}">完成</span></div>${a.status==='applied'?'<div class="btn-row"><button class="secondary" onclick="cancelApplication(\''+a.id+'\')">取消报名</button><button class="secondary" disabled>等待确认</button></div>':''}${a.status==='accepted'?`<div class="btn-row"><button class="secondary" onclick="openChat('${a.id}')">联系商家</button><button class="primary accent" onclick="completeApplication('${a.id}')">标记已完成</button></div><button class="text-btn danger" onclick="cancelApplication('${a.id}')">撤回已确认报名</button>`:''}${a.status==='completed'?`<div class="btn-row"><button class="secondary" onclick="openChat('${a.id}')">查看聊天</button><button class="secondary" onclick="showReview('${a.id}')">评价合作体验</button></div>`:''}</div>`}).join(''):'<div class="empty">还没有接单记录</div>'}</section>`}
function merchantOrders(list){return `<section class="section">${list.length?list.map(a=>{const t=getTask(a);return `<div class="order-card"><div class="order-top"><div><b>${esc(t?.title||'任务')}</b><div class="muted">收到报名 · ${esc(t?.time_text||'')} <button class="text-btn" onclick="openPublicProfile('${esc(a.worker_id)}','worker')">查看求职者档案 ›</button></div></div><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></div>${a.status==='applied'?`<div class="btn-row"><button class="secondary" onclick="merchantDecision('${a.id}','rejected')">拒绝</button><button class="primary" onclick="merchantDecision('${a.id}','accepted')">确认用人</button></div>`:''}${['accepted','completed'].includes(a.status)?`<div class="btn-row"><button class="secondary" onclick="openChat('${a.id}')">站内聊天</button>${a.status==='completed'?`<button class="secondary" onclick="showReview('${a.id}')">评价合作体验</button>`:`<button class="secondary" onclick="completeApplication('${a.id}')">标记已完成</button>`}</div>`:''}</div>`}).join(''):'<div class="empty">暂无需要处理的报名</div>'}</section>`}
async function merchantDecision(appId,status){try{await H.services.application.transition(appId,status);await loadData();render();toast('状态已更新');}catch(e){toast(H.errorText(e));}}

async function completeApplication(appId){try{await H.services.application.transition(appId,'completed');await loadData();render();toast('状态已更新');}catch(e){toast(H.errorText(e));}}

async function cancelApplication(appId){try{await H.services.application.transition(appId,'cancelled');await loadData();render();toast('状态已更新');}catch(e){toast(H.errorText(e));}}

async function openChat(appId){
 if(!requireLogin(()=>openChat(appId)))return;
 saveVisibleDrafts();const navigation=++uxNavigation,session=H.captureSession();
 const request=H.chatSequence=(H.chatSequence||0)+1;
 state.route='chat';state.routeChatId=appId;state.selectedApplication=null;syncLocation();updateHeader();app.innerHTML='<div class="inbox-empty">正在打开会话…</div>';
 try{const data=await H.services.inbox.conversation(appId);if(request!==H.chatSequence||navigation!==uxNavigation||!H.isCurrentSession(session)||state.route!=='chat')return;
  if(!['accepted','completed'].includes(data.application.status)&&!data.messages.some(m=>m.message_type!=='system'))throw new Error('商家确认后才能聊天');
  H.applyConversationPage(data,{reset:true});
  const peerId=data.application.worker_id===state.user.id?data.application.merchant_id:data.application.worker_id;
  const cached=state.inbox.find(c=>c.application_id===appId);const peer=cached?null:await H.services.merchant.publicProfile(peerId,data.application.worker_id===state.user.id?'merchant':'worker');
  if(request!==H.chatSequence||navigation!==uxNavigation||!H.isCurrentSession(session)||state.route!=='chat')return;
  state.chatPeer=cached?.peer_name||peer?.name||'工作搭子';
  await H.services.message.read(appId);const read=await H.services.inbox.conversation(appId);
  if(request!==H.chatSequence||navigation!==uxNavigation||!H.isCurrentSession(session)||state.route!=='chat')return;H.applyConversationPage(read);await H.services.inbox.load();if(request!==H.chatSequence||navigation!==uxNavigation||!H.isCurrentSession(session)||state.route!=='chat')return;render();scrollChatToLatest();
 }catch(e){if(request===H.chatSequence&&navigation===uxNavigation&&H.isCurrentSession(session)&&state.route==='chat'){go('messages');toast(H.errorText(e));}}
}
function scrollChatToLatest(){requestAnimationFrame(()=>document.getElementById('chatEnd')?.scrollIntoView({block:'end'}));}
function chat(){
 const a=state.selectedApplication;if(!a){go('messages');return;}const t=getTask(a),canSend=['accepted','completed'].includes(a.status),msgs=state.messages.filter(m=>m.application_id===a.id);
 app.innerHTML=`<section class="chat-shell direct-chat"><div class="chat-head"><button class="back" onclick="go('messages')">← 消息</button><div class="chat-peer"><h3>${esc(state.chatPeer||t?.company_name||'工作搭子')}</h3><div class="muted">${esc(t?.title||'任务沟通')}</div></div><button class="text-btn" onclick="go('orders')">接单记录</button></div><div class="chat-safe">请在站内确认工作安排，不要支付押金或帮助他人转账。</div><div class="chat-list">${msgs.length?msgs.map(m=>m.message_type==='system'?`<div class="chat-system">${esc(m.content)}</div>`:`<div class="msg-row ${m.sender_id===state.user.id?'mine':''}"><div class="msg">${esc(m.content)}<div class="msg-time">${formatTime(m.created_at)} ${m.sender_id===state.user.id?(m.read_at?'已读':'未读'):''}</div></div></div>`).join(''):'<div class="empty">先确认一下到场时间或交付要求吧。</div>'}<div id="chatEnd"></div></div>${canSend?'<div class="chat-input"><input id="chatText" maxlength="2000" aria-label="聊天内容" placeholder="发消息，直接聊聊这单活" onkeydown="if(event.key===\'Enter\'&&!event.isComposing)sendMessage()"><button onclick="sendMessage()">发送</button></div>':'<p class="chat-closed">本次合作已结束，可以查看历史聊天。</p>'}</section>`;
 restoreDraft(app.querySelector('.chat-input'),'chat',a.id);
 H.renderHistoryControl();
 if(H.sendingChat){const button=app.querySelector('.chat-input button');if(button){button.disabled=true;button.textContent='发送中…';}}
 H.layoutChat?.();
}
async function sendMessage(){
 const input=document.getElementById('chatText'),content=input?.value.trim(),a=state.selectedApplication;if(!content||!a||H.sendingChat)return;H.sendingChat=true;
 const session=H.captureSession(),key=draftKey('chat',a.id),button=app.querySelector('.chat-input button');let sent=false;
 if(button){button.disabled=true;button.textContent='发送中…';}saveVisibleDrafts();
 try{await H.services.message.send(a.id,content);sent=true;if(!H.isCurrentSession(session))return;
  saveVisibleDrafts();const draft=readDraft(key);if(draft?.chatText?.trim()===content){writeDraft(key,null);if(state.route==='chat'&&state.selectedApplication?.id===a.id){const current=document.getElementById('chatText');if(current)current.value='';}}
  const data=await H.services.inbox.conversation(a.id);await H.services.inbox.load();if(H.isCurrentSession(session)&&state.route==='chat'&&state.selectedApplication?.id===a.id){saveVisibleDrafts();H.applyConversationPage(data);chat();updateHeader();document.getElementById('chatText')?.focus();scrollChatToLatest();}
 }catch(e){if(H.isCurrentSession(session))toast(sent?'消息已发送，记录刷新失败，请刷新会话查看。':H.errorText(e));}
 finally{H.sendingChat=false;const current=app.querySelector('.chat-input button');if(current){current.disabled=false;current.textContent='发送';}}
}

function profile(){
  if(!state.user){app.innerHTML=`<section class="welcome-card"><div class="welcome-logo">H</div><h2>登录活搭</h2><p>保存接单记录、在线聊天、发布一单活，并查看每一步状态。</p><button class="primary accent" onclick="showAuth()">登录 / 注册</button><button class="ghost" onclick="demoLogin('worker')">一键体验求职者</button><button class="ghost" onclick="demoLogin('merchant')">一键体验已认证商家</button></section>`;return}
  const done=state.applications.filter(a=>String(getWorkerId(a))===String(state.user.id)&&a.status==='completed').length;const doing=state.applications.filter(a=>String(getWorkerId(a))===String(state.user.id)&&['applied','accepted'].includes(a.status)).length;const v=state.profile?.verification_status||'unverified';
  app.innerHTML=`<section class="profile-head"><div class="profile-row"><div><div class="profile-name">${esc(state.profile?.name||'用户')}</div><div class="profile-sub">${esc(state.profile?.city||CFG.CITY||'广州')} · ${esc((state.profile?.skills||[]).join(' / ')||'完善技能后匹配更准')}</div></div><span class="cloud-pill">${CLOUD_ENABLED?'云端':'本地'}账户</span></div><div class="stats"><div class="stat"><b>${doing}</b>进行中</div><div class="stat"><b>${done}</b>已完成</div><div class="stat"><b>${state.reports.filter(r=>r.status==='open').length}</b>举报处理中</div></div></section>
  <section class="menu"><button class="menu-item" onclick="go('orders')"><span>接单与报名记录</span><span class="menu-right">进度、确认、完成 ›</span></button><button class="menu-item" onclick="go('messages')"><span>我的消息</span><span class="menu-right">${(state.chatUnread||0)+(state.noticeUnread||0)} 条未读 ›</span></button><button class="menu-item" onclick="openPublicProfile('${esc(state.user.id)}','worker')"><span>我的公开档案</span><span>›</span></button><button class="menu-item" onclick="editProfile()"><span>个人资料</span><span class="menu-right">${state.profile?.role==='merchant'?'商家':'求职者'} ›</span></button><button class="menu-item" onclick="go('favorites')"><span>我的收藏</span><span class="menu-right">${state.favorites?.length||0} 个 ›</span></button><button class="menu-item" onclick="editSkills()"><span>技能标签</span><span class="menu-right">${esc((state.profile?.skills||[]).slice(0,2).join(' / ')||'去完善')} ›</span></button><button class="menu-item" onclick="showVerification()"><span>商家认证</span><span class="verify-pill ${v==='verified'?'ok':v==='pending'?'wait':v==='rejected'?'bad':''}">${verificationLabel(v)} ›</span></button><button class="menu-item" onclick="showLocationPicker()"><span>位置与附近兼职</span><span class="menu-right">${state.location?esc(state.location.label):'未授权'} ›</span></button><button class="menu-item" onclick="toast('真实资金结算将在支付与合规方案确定后接入')"><span>收入与结算</span><span class="menu-right">暂未接支付 ›</span></button><button class="menu-item danger" onclick="logout()"><span>退出登录</span><span>›</span></button></section>`;
}

function showAuth(after){
  modalRoot.innerHTML=`<div class="modal-backdrop" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()"><button class="modal-x" onclick="closeModal()">×</button><div class="auth-brand">活搭 HUODA</div><h2>登录 / 注册</h2><p class="muted">云端模式使用邮箱密码；本地模式可直接创建演示账户。</p><div class="field"><label>邮箱</label><input id="authEmail" type="email" placeholder="name@example.com"></div><div class="field"><label>密码</label><input id="authPassword" type="password" placeholder="至少 6 位"></div><div class="field"><label>昵称</label><input id="authName" placeholder="例如：小何"></div><div class="btn-row"><button class="secondary" onclick="authSubmit('login')">登录</button><button class="primary accent" onclick="authSubmit('signup')">注册</button></div><div class="or"><span>或者</span></div><div class="btn-row"><button class="secondary" onclick="demoLogin('worker')">体验求职者</button><button class="secondary" onclick="demoLogin('merchant')">体验商家</button></div></div></div>`;window._afterAuth=after;
}
async function authSubmit(mode){
  const email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value,name=document.getElementById('authName').value.trim()||email.split('@')[0];if(!email||password.length<6){toast('请输入有效邮箱和至少 6 位密码');return}
  if(!CLOUD_ENABLED){const db=localDb();let u=db.users.find(x=>x.email===email);if(mode==='signup'){if(u){toast('该邮箱已注册');return}u=enrichUser({id:uid('user'),email,name,role:'worker',city:CFG.CITY||'广州',skills:[],active:true});db.users.forEach(x=>x.active=false);db.users.push(u)}else{if(!u){toast('本地账号不存在，请先注册');return}db.users.forEach(x=>x.active=x.id===u.id)}saveLocal(db);state.user=u;state.profile=u;closeModal();await H.services.favorite.merge();await loadData();render();toast('登录成功');runAfterAuth();return}
  try{if(mode==='signup'){const {data,error}=await sb.auth.signUp({email,password,options:{data:{name,role:'worker'}}});if(error)throw error;toast(data.session?'注册成功':'注册成功，请按邮箱提示完成验证')}else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;toast('登录成功')}closeModal()}catch(e){toast(e.message||'登录失败')}
}
function runAfterAuth(){if(typeof window._afterAuth==='function'){const fn=window._afterAuth;window._afterAuth=null;setTimeout(fn,80)}}
function closeModal(e){if(e&&e.target!==e.currentTarget)return;modalRoot.innerHTML=''}
async function demoLogin(role='worker'){
  if(CLOUD_ENABLED){toast('云端模式请用邮箱注册；演示账号只用于本地模式');return}const db=localDb(),id=role==='merchant'?'merchant-demo':'worker-demo';let u=db.users.find(x=>x.id===id);if(!u){u=enrichUser({id,name:role==='merchant'?'南屿电商（演示）':'小何（演示）',email:`${id}@demo.local`,role,city:CFG.CITY||'广州',skills:role==='worker'?['PS','电商设计']:[],verification_status:role==='merchant'?'verified':'unverified',company_name:role==='merchant'?'南屿电商':'',active:true});db.users.push(u)}if(role==='merchant'){u.role='merchant';u.verification_status='verified';u.company_name=u.company_name||'南屿电商'}db.users.forEach(x=>x.active=x.id===id);saveLocal(db);state.user=u;state.profile=u;closeModal();await H.services.favorite.merge();await loadData();render();toast(role==='merchant'?'已切换为已认证演示商家':'已切换为演示求职者');runAfterAuth();
}
async function logout(){H.inboxSequence=(H.inboxSequence||0)+1;state.inboxQuery='';state.inboxFilter='all';state.messageTab='chats';state.inbox=[];state.chatUnread=0;state.noticeUnread=0;state.orderTab='worker';window._afterAuth=null;state.selectedApplication=null;state.selectedTask=null;if(CLOUD_ENABLED)await sb.auth.signOut();else{const db=localDb();db.users.forEach(x=>x.active=false);saveLocal(db);state.user=null;state.profile=null;state.favorites=loadFavorites();await loadData();render()}toast('已退出')}
function editProfile(){const p=state.profile||{};modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><button class="modal-x" onclick="closeModal()">×</button><h2>个人资料</h2><div class="field"><label>昵称</label><input id="eName" value="${esc(p.name||'')}"></div><div class="field"><label>身份</label><select id="eRole"><option value="worker" ${p.role!=='merchant'?'selected':''}>求职者</option><option value="merchant" ${p.role==='merchant'?'selected':''}>商家</option></select></div><div class="field"><label>城市</label><input id="eCity" value="${esc(p.city||CFG.CITY||'广州')}"></div><div class="field"><label>个人简介</label><textarea id="eBio" maxlength="1000">${esc(p.bio||'')}</textarea></div><div class="field"><label>头像 HTTPS 地址（可选）</label><input id="eAvatar" value="${esc(p.avatar_url||'')}" placeholder="https://..."></div><button class="primary" onclick="saveProfile()">保存</button></div></div>`}
async function saveProfile(){try{await H.services.auth.save({name:document.getElementById('eName').value.trim()||'用户',current_mode:document.getElementById('eRole').value,city:document.getElementById('eCity').value.trim()||'广州',bio:document.getElementById('eBio').value.trim(),avatar_url:document.getElementById('eAvatar').value.trim()});closeModal();await loadData();render();toast('资料已保存');}catch(e){toast(H.errorText(e));}}

function editSkills(){modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><button class="modal-x" onclick="closeModal()">×</button><h2>技能标签</h2><p class="muted">标签会参与“为你匹配”。用逗号分隔，例如 PS、电商设计、剪映。</p><div class="field"><input id="eSkills" value="${esc((state.profile?.skills||[]).join(', '))}" placeholder="PS, 电商设计"></div><button class="primary accent" onclick="saveSkills()">保存</button></div></div>`}
async function saveSkills(){try{await H.services.auth.save({skills:document.getElementById('eSkills').value.split(/[,，]/).map(x=>x.trim()).filter(Boolean).slice(0,8)});closeModal();await loadData();render();toast('技能已更新');}catch(e){toast(H.errorText(e));}}

function showVerification(fromPublish=false){
  if(!requireLogin(()=>showVerification(fromPublish)))return;const p=state.profile||{},s=p.verification_status||'unverified';if(s==='verified'){toast('商家认证已经通过');return}
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><button class="modal-x" onclick="closeModal()">×</button><div class="auth-brand">商家认证</div><h2>${s==='pending'?'认证正在审核':'提交商家资料'}</h2><p class="muted">${CLOUD_ENABLED?'营业执照上传至私有存储，仅本人和审核人员可访问。':'本地演示仅记录文件名；真实上传需连接云端。'}</p>${s==='pending'?'<div class="notice warn">你的认证申请已提交。审核结果会通过通知中心告知。</div>':''}<div class="field"><label>企业 / 商家名称</label><input id="vCompany" value="${esc(p.company_name||'')}" placeholder="例如：南屿电商"></div><div class="field"><label>统一社会信用代码</label><input id="vCredit" value="${esc(p.credit_code||'')}" placeholder="18 位代码"></div><div class="field"><label>营业执照</label><input id="vLicense" type="file" accept="image/jpeg,image/png,application/pdf"></div><button class="primary accent" onclick="submitVerification(${fromPublish?'true':'false'})">${s==='pending'?'重新提交资料':'提交认证审核'}</button></div></div>`;
}
async function submitVerification(fromPublish=false){try{await H.services.merchant.submit(document.getElementById('vCompany').value.trim(),document.getElementById('vCredit').value.trim().toUpperCase(),document.getElementById('vLicense').files?.[0]);if(CLOUD_ENABLED)await hydrateUser(state.user);await loadData();closeModal();render();toast('认证资料已提交审核');if(fromPublish)go('publish');}catch(e){toast(H.errorText(e));}}

function showReport(taskId){
  if(!requireLogin(()=>showReport(taskId)))return;modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><button class="modal-x" onclick="closeModal()">×</button><div class="auth-brand">任务举报</div><h2>哪里有问题？</h2><div class="field"><label>举报原因</label><select id="rReason"><option>要求交押金 / 费用</option><option>工资与描述不符</option><option>地点或工作内容不符</option><option>刷单 / 代收转账</option><option>虚假商家</option><option>其他违规</option></select></div><div class="field"><label>补充说明</label><textarea id="rDetail" placeholder="尽量描述发生了什么，方便平台审核"></textarea></div><button class="danger-btn" onclick="submitReport('${esc(taskId)}')">提交举报</button></div></div>`;
}
async function submitReport(taskId){try{const reason=document.getElementById('rReason').value,detail=document.getElementById('rDetail').value.trim();H.auth();if(CLOUD_ENABLED)await H.rpc('submit_report',{p_task_id:taskId,p_reason:reason,p_detail:detail});else await H.localWrite(db=>{db.reports.unshift({id:uid('report'),reporter_id:state.user.id,task_id:taskId,reason,detail,status:'open',created_at:Date.now()});});closeModal();await loadData();render();toast('举报已提交');}catch(e){toast(H.errorText(e));}}

function filterChoice(group,value,label){
  const on=String(state.filterDraft?.[group])===String(value);
  return `<button class="filter-choice ${on?'selected':''}" data-filter-group="${esc(group)}" data-filter-value="${esc(value)}" onclick="pickAdvancedFilter('${group}','${esc(value)}')">${esc(label)}</button>`;
}
function showAdvancedFilters(keepDraft=false){
  if(!keepDraft)state.filterDraft={...(state.advancedFilters||FILTER_DEFAULTS)};
  const d=state.filterDraft||FILTER_DEFAULTS;
  const needsLocation=d.distance!=='全部'&&!state.location;
  modalRoot.innerHTML=`<div class="modal-backdrop filter-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal filter-sheet">
    <div class="sheet-handle"></div><button class="modal-x" onclick="closeModal()">×</button>
    <div class="filter-sheet-head"><div><div class="auth-brand">更多条件</div><h2>筛选兼职</h2></div><button class="sheet-reset" onclick="resetAdvancedFilters()">重置</button></div>
    <div class="filter-group"><h3>工作方式</h3><div class="filter-options">${filterChoice('workType','全部','不限')}${filterChoice('workType','线下','线下')}${filterChoice('workType','线上','线上')}</div></div>
    <div class="filter-group"><h3>结算方式</h3><div class="filter-options">${filterChoice('payMode','全部','不限')}${filterChoice('payMode','日结','日结')}${filterChoice('payMode','周结','周结')}${filterChoice('payMode','月结','月结')}${filterChoice('payMode','完工结','完工结')}</div></div>
    <div class="filter-group"><h3>工作时段</h3><div class="filter-options">${filterChoice('shift','全部','不限')}${filterChoice('shift','白班','白班')}${filterChoice('shift','晚班','晚班')}${filterChoice('shift','周末','周末')}</div></div>
    <div class="filter-group"><div class="filter-group-title"><h3>距离</h3>${needsLocation?'<button class="text-btn" onclick="closeModal();showLocationPicker()">先去定位 ›</button>':''}</div><div class="filter-options">${filterChoice('distance','全部','不限')}${filterChoice('distance','1','1km内')}${filterChoice('distance','3','3km内')}${filterChoice('distance','5','5km内')}${filterChoice('distance','10','10km内')}</div><p class="filter-note">${state.location?'按当前定位计算线下兼职直线距离。':'距离筛选需要先授权定位或使用广州演示位置。'}</p></div>
    <div class="filter-group salary-filter"><h3>薪资区间</h3>${salaryFields('mobileSalary',d)}</div>
    <div class="filter-actions"><button class="secondary" onclick="closeModal()">取消</button><button class="primary accent" onclick="applyAdvancedFilters()">查看结果</button></div>
  </div></div>`;
}
function pickAdvancedFilter(group,value){
  state.filterDraft={...(state.filterDraft||FILTER_DEFAULTS),[group]:value};
  modalRoot.querySelectorAll('.filter-choice').forEach(btn=>{
    if(btn.dataset.filterGroup===group)btn.classList.toggle('selected',btn.dataset.filterValue===String(value));
  });
}
function resetAdvancedFilters(){
  state.filterDraft={...FILTER_DEFAULTS};
  showAdvancedFilters(true);
}
function applyAdvancedFilters(){
  let d;try{d={...(state.filterDraft||FILTER_DEFAULTS),...readSalary('mobileSalary')};}catch(e){toast(H.errorText(e));return;}
  if(d.distance!=='全部'&&!state.location){toast('距离筛选需要先定位');return}
  if(d.workType!=='全部'&&['线下','线上'].includes(state.filter))state.filter='全部';
  if(d.payMode!=='全部'&&state.filter==='日结')state.filter='全部';
  if(d.shift!=='全部'&&state.filter==='晚班')state.filter='全部';
  if(d.workType==='线上'&&d.distance!=='全部'){toast('线上任务不适用距离筛选，请取消其中一项');return;}state.advancedFilters=d;closeModal();state.route='home';render();if(CLOUD_ENABLED)reloadFeed();
}

function showLocationPicker(){
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><button class="modal-x" onclick="closeModal()">×</button><div class="auth-brand">附近兼职</div><h2>选择位置方式</h2><p class="muted">${CLOUD_ENABLED?'授权后会把当前位置发送给服务器，用于查询半径内的兼职；不写入账号资料。':'设备位置仅在当前页面计算演示任务直线距离，不写入账号资料。'}</p><div class="location-options"><button class="location-option" onclick="requestLocation()"><b>使用设备当前位置</b><small>浏览器会弹出定位授权；建议通过 localhost / HTTPS 打开。</small></button>${!CLOUD_ENABLED?'<button class="location-option" onclick="useDemoLocation()"><b>使用广州演示位置</b><small>只用于本地距离演示。</small></button>':''}<button class="location-option" onclick="clearLocation()"><b>不使用精确位置</b><small>只按城市和任务类型浏览。</small></button></div></div></div>`;
}
async function requestLocation(){toast('正在请求定位…');try{state.location=await H.services.location.locate();if(state.filter==='线下'&&state.advancedFilters.distance==='全部')state.advancedFilters.distance='3';closeModal();render();if(CLOUD_ENABLED)await reloadFeed();toast('定位成功');}catch(e){toast(H.errorText(e));}}

function useDemoLocation(){if(CLOUD_ENABLED)return;state.location={lat:Number(CFG.DEFAULT_LAT)||23.1291,lng:Number(CFG.DEFAULT_LNG)||113.2644,label:'广州演示'};if(state.filter==='线下'&&state.advancedFilters.distance==='全部')state.advancedFilters.distance='3';closeModal();render();toast('已使用广州演示位置');}

function clearLocation(){state.location=null;state.advancedFilters.distance='全部';if(state.sort==='distance')state.sort='recommend';closeModal();render();if(CLOUD_ENABLED)reloadFeed();}

function admin(){go('profile');}

function setFilter(f){
  const next=(f===state.filter&&f!=='全部')?'全部':f;
  state.filter=next;
  if(next==='线下'||next==='线上')state.advancedFilters.workType='全部';
  if(next==='日结')state.advancedFilters.payMode='全部';
  if(next==='晚班')state.advancedFilters.shift='全部';
  if(next==='线上'||next==='全部')state.advancedFilters.distance='全部';if(next==='线下'&&state.location)state.advancedFilters.distance='3';state.route='home';render();if(CLOUD_ENABLED)reloadFeed();
  if(next==='线下'&&!state.location)setTimeout(showLocationPicker,0);
}
async function openTask(id){
 saveVisibleDrafts();const request=++uxNavigation;state.routeTaskId=String(id);state.selectedTask=null;state.taskError='';state.route='detail';render();
 try{const task=await H.services.task.get(id);if(request!==uxNavigation||state.route!=='detail')return;if(!task)throw new Error('任务可能已下架或当前账户无权查看');state.selectedTask=task;render();}
 catch(e){if(request!==uxNavigation||state.route!=='detail')return;state.taskError=H.errorText(e);render();}
}

function setPublishTab(t){state.publishTab=t;render()}
function setOrderTab(t){state.orderTab=t;render()}
function go(route){saveVisibleDrafts();++uxNavigation;state.findWork=false;if(route==='notifications'){state.messageTab='notices';route='messages';}else if(route==='messages')state.messageTab='chats';state.route=route;render();if(route==='messages')refreshMessages();else if(CLOUD_ENABLED)H.refreshLive();}
function toast(msg){const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2100)}

// UI state is scoped to this tab and account; business data still uses shared services.
let uxRouteReady=false,uxNavigation=0,uxPublishing=false;
const uxDrafts=new Map();
function draftKey(kind,id=''){return `${LS_KEY}:draft:${CLOUD_ENABLED?'cloud':'local'}:${state.user?.id||'guest'}:${kind}:${id}`;}
function readDraft(key){if(uxDrafts.has(key))return uxDrafts.get(key);try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}}
function writeDraft(key,value){uxDrafts.set(key,value);try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{/* In-memory drafts remain available when storage is disabled. */}}
function saveVisibleDrafts(){app.querySelectorAll('[data-draft-key]').forEach(box=>{const key=box.dataset.draftKey;if(!key)return;const values={};box.querySelectorAll('input[id],select[id],textarea[id]').forEach(input=>{if(input.type!=='file')values[input.id]=input.value;});writeDraft(key,values);});}
function restoreDraft(box,kind,id=''){
 if(!box)return;const key=draftKey(kind,id),values=readDraft(key);box.dataset.draftKey=key;
 box.querySelectorAll('input[id],select[id],textarea[id]').forEach(input=>{if(values&&Object.hasOwn(values,input.id))input.value=values[input.id];const label=input.closest('.field')?.querySelector('label');if(label)label.htmlFor=input.id;});
}
app.addEventListener('input',saveVisibleDrafts);app.addEventListener('change',saveVisibleDrafts);window.addEventListener('pagehide',saveVisibleDrafts);
function routeHash(){
 if(state.route==='detail')return '#/detail/'+encodeURIComponent(state.selectedTask?.id||state.routeTaskId||'');
 if(state.route==='chat')return '#/chat/'+encodeURIComponent(state.selectedApplication?.id||state.routeChatId||'');
 if(state.route==='publicProfile')return '#/publicProfile/'+encodeURIComponent(state.publicProfileId||'')+'/'+(state.publicProfileKind==='merchant'?'merchant':'worker');
 return '#/'+(['home','publish','orders','profile','favorites','messages'].includes(state.route)?state.route:'home');
}
function syncLocation(){
 const hash=routeHash();if(location.hash===hash)return;
 const previous=history.state?.huodaUX,depth=previous?.depth||0;
 if(!previous&&!location.hash)history.replaceState({...history.state,huodaUX:{depth:0}},'',hash);
 else history.pushState({huodaUX:{depth:depth+1}},'',hash);
}
function backRoute(fallback='home'){if(history.state?.huodaUX?.depth>0)history.back();else go(fallback);}
async function restoreLocation(){
 saveVisibleDrafts();++uxNavigation;closeModal();
 if(!history.state?.huodaUX)history.replaceState({...history.state,huodaUX:{depth:0}},'');
 let parts;try{parts=location.hash.replace(/^#\/?/,'').split('/').map(decodeURIComponent);}catch{parts=[];}
 const [route,id,kind]=parts;
 if(route==='detail'&&id){await openTask(id);return;}
 if(route==='chat'&&id){if(!state.user){state.route='messages';render();showAuth(()=>openChat(id));return;}await openChat(id);return;}
 if(route==='publicProfile'&&id){await openPublicProfile(id,kind==='merchant'?'merchant':'worker');return;}
 if(!['home','publish','orders','profile','favorites','messages'].includes(route))history.replaceState(history.state,'','#/home');
 go(['home','publish','orders','profile','favorites','messages'].includes(route)?route:'home');
}
window.addEventListener('popstate',()=>{if(uxRouteReady)restoreLocation();});

Object.assign(window,{go,setFilter,openTask,applyTask,createTask,setPublishTab,setOrderTab,merchantDecision,completeApplication,cancelApplication,openChat,sendMessage,showAuth,authSubmit,closeModal,demoLogin,logout,editProfile,saveProfile,editSkills,saveSkills,showVerification,submitVerification,showReport,submitReport,showAdvancedFilters,pickAdvancedFilter,resetAdvancedFilters,applyAdvancedFilters,showLocationPicker,requestLocation,useDemoLocation,clearLocation,searchNow,clearSearch,setSort,toggleFavorite,favoritesPage,toast});

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.route)));
document.getElementById('accountBtn').addEventListener('click',()=>go('profile'));
document.getElementById('cityBtn').addEventListener('click',showLocationPicker);


function updateFeedPager(){document.getElementById('feedPager')?.remove();const list=document.getElementById('taskList');if(!list)return;if(state.feedError){if(state.tasks.length&&state.nextCursor!==null)list.insertAdjacentHTML('afterend',`<div id="feedPager" class="empty" role="status"><p>${esc(state.feedError)}</p><button class="secondary" onclick="loadMoreTasks()">重试加载更多</button></div>`);else list.innerHTML=`<div class="empty" role="status">${esc(state.feedError)}<button class="secondary" onclick="reloadFeed()">重试</button></div>`;}else if(CLOUD_ENABLED&&state.nextCursor!==null)list.insertAdjacentHTML('afterend','<button id="feedPager" class="secondary" onclick="loadMoreTasks()">加载更多兼职</button>');}
