H.services.inbox={
 async list(query=''){
  if(!state.user)return {items:[],chat_unread:0,notice_unread:0};
  if(CLOUD_ENABLED)return H.rpc('get_message_inbox',{p_query:query.trim()});
  const db=localDb(),user=state.user.id,q=query.trim().toLowerCase();
  const items=db.applications.filter(a=>[a.worker_id,a.merchant_id].includes(user)).map(a=>{
   const messages=db.messages.filter(m=>m.application_id===a.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id).localeCompare(String(a.id)));
   if(!['accepted','completed'].includes(a.status)&&!messages.some(m=>m.message_type!=='system'))return null;
   const task=db.tasks.find(t=>t.id===a.task_id)||{},peerId=a.worker_id===user?a.merchant_id:a.worker_id,peer=db.users.find(u=>u.id===peerId),last=messages[0];
   return {application_id:a.id,task_id:a.task_id,status:a.status,task_title:task.title||'任务沟通',company_name:task.company_name||'',peer_id:peerId,peer_name:peer?.name||(a.worker_id===user?task.company_name:'接单者')||'用户',peer_kind:a.worker_id===user?'merchant':'worker',avatar_url:peer?.avatar_url||'',price_fen:task.price_fen??Math.round(Number(task.price||0)*100),price_unit:task.price_unit,last_content:last?.content||'',last_type:last?.message_type||'text',last_sender_id:last?.sender_id,last_read_at:last?.read_at,updated_at:last?.created_at||a.created_at,unread_count:messages.filter(m=>m.sender_id!==user&&m.message_type!=='system'&&!m.read_at).length,_search:[peer?.name,task.company_name,task.title,...messages.map(m=>m.content)].join(' ').toLowerCase()};
  }).filter(Boolean).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)||a.application_id.localeCompare(b.application_id));
  return {items:items.filter(c=>!q||c._search.includes(q)),chat_unread:items.reduce((n,c)=>n+c.unread_count,0),notice_unread:(db.notifications||[]).filter(n=>n.user_id===user&&n.type!=='message'&&!n.read_at).length};
 },
 async load(){const seq=H.inboxSequence=(H.inboxSequence||0)+1,user=state.user?.id;const result=await this.list(state.inboxQuery||'');if(seq!==H.inboxSequence||user!==state.user?.id)return false;state.inbox=result.items;state.chatUnread=Number(result.chat_unread);state.noticeUnread=Number(result.notice_unread);state.inboxError='';return true;},
 async conversation(id){
  if(CLOUD_ENABLED){const a=H.unwrap(await sb.from('applications').select('*,tasks(*)').eq('id',id).single());const messages=H.unwrap(await sb.from('messages').select('*').eq('application_id',id).order('created_at',{ascending:false}).limit(200));return {application:a,messages:messages.reverse()};}
  const db=localDb(),a=db.applications.find(a=>a.id===id&&[a.worker_id,a.merchant_id].includes(H.auth()));if(!a)H.fail('FORBIDDEN');return {application:a,messages:db.messages.filter(m=>m.application_id===id)};
 }
};
