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
 // One bounded page. Callers retain/merge loaded history and explicitly pass
 // next_cursor as before when requesting older messages. Null means latest.
 async conversation(id,{before=null}={}){
  const session=H.services.auth.capture();
  if(before!==null&&(typeof before!=='object'||Array.isArray(before)||typeof before.created_at!=='string'||!Number.isFinite(Date.parse(before.created_at))||typeof before.id!=='string'||!before.id))H.fail('INVALID_PAGE');
  // Keep the server's timestamp string intact (PostgreSQL has microseconds).
  const cursor=before===null?null:{created_at:before.created_at,id:before.id};
  if(CLOUD_ENABLED){
   const a=H.unwrap(await sb.from('applications').select('*,tasks(*)').eq('id',id).single());H.services.auth.assertCurrent(session);
   const page=await H.rpc('get_conversation_messages',{p_application_id:id,p_before_at:cursor?.created_at??null,p_before_id:cursor?.id??null,p_limit:200});
   H.services.auth.assertCurrent(session);
   return {application:a,messages:[...page.items].reverse(),next_cursor:page.next_cursor};
  }
  const db=localDb(),a=db.applications.find(a=>a.id===id&&[a.worker_id,a.merchant_id].includes(session.id));if(!a)H.fail('FORBIDDEN');
  const cutoff=cursor?Date.parse(cursor.created_at):null;
  const rows=db.messages.filter(m=>m.application_id===id&&(!cursor||Date.parse(m.created_at)<cutoff||(Date.parse(m.created_at)===cutoff&&String(m.id)<cursor.id)))
   .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||(String(a.id)<String(b.id)?1:String(a.id)>String(b.id)?-1:0));
  const messages=rows.slice(0,200),last=messages.at(-1);
  return {application:a,messages:messages.reverse(),next_cursor:rows.length>200?{created_at:last.created_at,id:last.id}:null};
 }
};
