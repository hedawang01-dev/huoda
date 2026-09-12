H.services.task={
 async localFeed(){return localDb().tasks.map(H.task);},
 params(cursor=0){const f=state.advancedFilters;return {user_lat:state.location?.lat??null,user_lng:state.location?.lng??null,radius_km:f.distance==='全部'?null:Number(f.distance),city:state.profile?.city||CFG.CITY||'广州',work_type:({'线上':'online','线下':'offline'})[f.workType==='全部'?state.filter:f.workType]||null,pay_mode:f.payMode==='全部'?(state.filter==='日结'?'日结':null):f.payMode,shift:f.shift==='全部'?(state.filter==='晚班'?'晚班':null):f.shift,sort_mode:state.sort,page_limit:20,page_cursor:cursor,keyword:state.query.trim()};},
 async search(cursor=0){const f=state.advancedFilters,params=this.params(cursor);if(f.minPrice!==''||f.maxPrice!==''||f.priceUnit!=='全部'){params.min_price_fen=f.minPrice===''?null:Math.round(Number(f.minPrice)*100);params.max_price_fen=f.maxPrice===''?null:Math.round(Number(f.maxPrice)*100);params.price_unit_filter=f.priceUnit==='全部'?null:f.priceUnit;return H.rpc('search_tasks_v054',params);}return H.rpc('search_tasks_v054',params);},
 async get(id){return CLOUD_ENABLED?H.task(H.unwrap(await sb.from('tasks').select('*').eq('id',id).single())):localDb().tasks.find(t=>String(t.id)===String(id));},
 async create(task,{submit=true}={}){
  const user=H.auth();
  if(CLOUD_ENABLED)return H.rpc('create_task_v054',{p_task:task,p_submit:submit});
  return H.localWrite(db=>{const owner=db.users.find(u=>u.id===user);if(submit&&owner?.verification_status!=='verified')H.fail('MERCHANT_NOT_VERIFIED');const status=submit?'pending_review':'draft',row={...task,id:uid('task'),owner_id:user,company_name:owner?.company_name||owner?.name||'商家',review_status:'pending',status,spots_left:task.spots_total,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};db.tasks.unshift(row);H.audit(db,submit?'submitted':'drafted','task',row.id,null,row);return row;});
 },
 async transition(id,status){
  const user=H.auth();if(CLOUD_ENABLED)return H.rpc('transition_task_v054',{p_task_id:id,p_status:status});
  return H.localWrite(db=>{const task=db.tasks.find(t=>t.id===id&&t.owner_id===user);if(!task)H.fail('FORBIDDEN');const before={...task},owner=db.users.find(u=>u.id===user),closeOpen=reason=>{for(const application of db.applications.filter(a=>a.task_id===id&&['applied','viewed','communicating'].includes(a.status))){const old={...application};application.status='rejected';application.updated_at=new Date().toISOString();H.notify(db,application.worker_id,'rejected','报名已结束',task.title,{application_id:application.id,task_id:id,reason});db.messages.push({id:uid('msg'),application_id:application.id,sender_id:user,content:'任务已结束，本次报名不再继续',message_type:'system',created_at:new Date().toISOString()});H.audit(db,'rejected_'+reason,'application',application.id,old,{...application});}};
   if(status==='pending_review'){if(task.status!=='draft')H.fail('INVALID_TRANSITION');if(owner?.verification_status!=='verified')H.fail('MERCHANT_NOT_VERIFIED');task.status='pending_review';task.review_status='pending';}
    else if(status==='ended'){if(!['recruiting','full'].includes(task.status))H.fail('INVALID_TRANSITION');task.status='ended';task.ended_at=new Date().toISOString();closeOpen('task_ended');}
    else if(status==='taken_down'){if(!['draft','pending_review','recruiting','full'].includes(task.status))H.fail('INVALID_TRANSITION');task.status='taken_down';task.taken_down_at=new Date().toISOString();closeOpen('task_taken_down');}
   else H.fail('INVALID_TRANSITION');
   task.updated_at=new Date().toISOString();H.audit(db,'task_'+status,'task',id,before,{...task});return task;
  });
 },
 async edit(id,{title,time_text,description}){
  const user=H.auth();if(CLOUD_ENABLED)return H.rpc('edit_task_v054',{p_task_id:id,p_title:title,p_description:description,p_time_text:time_text});
  return H.localWrite(db=>{const task=db.tasks.find(t=>t.id===id&&t.owner_id===user);if(!task)H.fail('FORBIDDEN');if(task.status==='ended')H.fail('INVALID_TRANSITION');if(task.status!=='draft'&&db.users.find(u=>u.id===user)?.verification_status!=='verified')H.fail('MERCHANT_NOT_VERIFIED');if(db.applications.some(a=>a.task_id===id&&['accepted','completed'].includes(a.status)))H.fail('INVALID_TRANSITION');const before={...task};Object.assign(task,{title,time_text,description,status:task.status==='draft'?'draft':'pending_review',review_status:'pending',taken_down_at:null,updated_at:new Date().toISOString()});H.audit(db,'edited','task',id,before,{...task});for(const application of db.applications.filter(a=>a.task_id===id&&['applied','viewed','communicating'].includes(a.status)))H.notify(db,application.worker_id,'task_changed','商家更新了任务信息',time_text,{application_id:application.id,task_id:id});return task;});
 }
};
