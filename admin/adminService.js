(function(){
 const STORE='huoda_mvp_v050';let config={},client=null,cloud=false;
 const readLocal=()=>JSON.parse(localStorage.getItem(STORE)||'{"users":[],"tasks":[],"reports":[],"verificationRequests":[]}');
 async function call(action,kind,extra={}){const {data}=await client.auth.getSession();if(!data.session)throw new Error('请先登录');const response=await fetch(config.SUPABASE_URL+'/functions/v1/admin-review',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action,kind,...extra})});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error?.message||result.error?.code||'请求失败');return result.data;}
 window.HuodaAdminService={
  configure(next){config=next||{};cloud=Boolean(config.SUPABASE_URL&&config.SUPABASE_KEY);return {cloud,blocked:(Boolean(config.SUPABASE_URL||config.SUPABASE_KEY)||config.ENVIRONMENT==='production')&&!cloud};},
  async connect(){if(!cloud)return false;await new Promise((ok,bad)=>{const s=document.createElement('script');s.src='../vendor/supabase-2.57.4.js';s.onload=ok;s.onerror=()=>bad(new Error('云端组件加载失败'));document.head.append(s);});client=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_KEY,{auth:{storageKey:'huoda-admin-auth'}});return true;},
  async hasSession(){if(!cloud)return true;const {data,error}=await client.auth.getSession();if(error)throw error;return Boolean(data.session);},
  async login(email,password){if(!cloud)return true;const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;return true;},
  async logout(){if(cloud){const {error}=await client.auth.signOut();if(error)throw error;}},
  async list(kind){if(cloud)return call('list',kind);const db=readLocal();return kind==='merchant'?(db.verificationRequests||[]).filter(x=>x.status==='pending'):kind==='task'?(db.tasks||[]).filter(x=>x.review_status==='pending'&&x.status==='pending_review'):(db.reports||[]).filter(x=>x.status==='open');},
  async license(kind,id){if(!cloud)throw new Error('本地演示没有真实执照文件');return call('license',kind,{id});},
  async moderate(kind,id,status){
   if(cloud)return call('moderate',kind,{id,status});
   const run=()=>{const db=readLocal();let row,before,user;
    if(kind==='merchant'){row=(db.verificationRequests||[]).find(x=>x.id===id);if(!row||row.status!=='pending')throw new Error('记录已变更');before={...row};row.status=status;user=(db.users||[]).find(x=>x.id===row.user_id);if(user)Object.assign(user,{verification_status:status,verified:status==='verified',verified_at:status==='verified'?new Date().toISOString():null});}
    else if(kind==='task'){row=(db.tasks||[]).find(x=>x.id===id);if(!row||row.review_status!=='pending'||row.status!=='pending_review')throw new Error('记录已变更');if(status==='approved'&&!(db.users||[]).some(u=>u.id===row.owner_id&&u.verification_status==='verified'))throw new Error('商家尚未通过认证');before={...row};row.review_status=status;row.status=status==='approved'?(Number(row.spots_left)>0?'recruiting':'full'):'taken_down';if(status==='rejected')for(const application of (db.applications||[]).filter(a=>a.task_id===row.id&&['applied','viewed','communicating'].includes(a.status))){application.status='rejected';application.updated_at=new Date().toISOString();db.notifications??=[];db.notifications.unshift({id:crypto.randomUUID(),user_id:application.worker_id,type:'rejected',title:'报名已结束',body:row.title,data:{application_id:application.id,task_id:row.id,reason:'review_rejected'},read_at:null,created_at:new Date().toISOString()});db.messages??=[];db.messages.push({id:crypto.randomUUID(),application_id:application.id,sender_id:'local-demo-admin',content:'任务审核未通过，本次报名不再继续',message_type:'system',created_at:new Date().toISOString()});}}
    else{row=(db.reports||[]).find(x=>x.id===id);if(!row||row.status!=='open')throw new Error('记录已变更');before={...row};row.status=status;}
    db.audit_logs??=[];db.audit_logs.push({id:crypto.randomUUID(),actor_id:'local-demo-admin',action:'moderate_'+status,target_type:kind,target_id:id,before_data:before,after_data:{...row},created_at:new Date().toISOString()});
    db.notifications??=[];db.notifications.unshift({id:crypto.randomUUID(),user_id:kind==='merchant'?row.user_id:kind==='task'?row.owner_id:row.reporter_id,type:'moderation',title:kind==='merchant'?'商家认证结果':kind==='task'?'任务审核结果':'举报处理结果',body:({verified:'认证通过',approved:'审核通过',rejected:'审核未通过',resolved:'举报已处理',dismissed:'举报不成立'})[status],data:{kind,target_id:id},read_at:null,created_at:new Date().toISOString()});localStorage.setItem(STORE,JSON.stringify(db));
   };
   return navigator.locks?navigator.locks.request('huoda-v050-write',run):run();
  }
 };
})();
