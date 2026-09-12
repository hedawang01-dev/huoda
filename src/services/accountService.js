H.services.account={
 empty(){return {applications:[],messages:[],reports:[],notifications:[],reviews:[],ownTasks:[],favorites:[],unreadCount:0};},
 async load(){
  const session=H.captureSession();
  if(!session.id)return this.empty();
  if(CLOUD_ENABLED){
   const [applications,reports,notifications,reviews,ownTasks,unread]=await Promise.all([
    sb.from('applications').select('*,tasks(*)').order('created_at',{ascending:false}),
    sb.from('reports').select('*').eq('reporter_id',session.id).order('created_at',{ascending:false}),
    sb.from('notifications').select('*').eq('user_id',session.id).order('created_at',{ascending:false}).limit(100),
    sb.from('reviews').select('*').eq('reviewer_id',session.id),
    sb.from('tasks').select('*').eq('owner_id',session.id).order('created_at',{ascending:false}),
    sb.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',session.id).is('read_at',null)
   ]);
   if(!H.isCurrentSession(session))H.fail('SESSION_CHANGED');
   const snapshot={applications:H.unwrap(applications)||[],reports:H.unwrap(reports)||[],notifications:H.unwrap(notifications)||[],reviews:H.unwrap(reviews)||[],ownTasks:(H.unwrap(ownTasks)||[]).map(H.task),unreadCount:unread.count||0};H.unwrap(unread);
   snapshot.favorites=await H.services.favorite.list();
   if(!H.isCurrentSession(session))H.fail('SESSION_CHANGED');
   return snapshot;
  }
  const db=localDb(),fresh=db.users.find(u=>u.id===session.id);
  if(!fresh)H.fail('AUTH_REQUIRED');
  const applications=db.applications.filter(a=>[a.worker_id,a.merchant_id].includes(session.id));
  const ids=new Set(applications.map(a=>a.id));
  const notifications=db.notifications.filter(n=>n.user_id===session.id);
  return {applications,messages:db.messages.filter(m=>ids.has(m.application_id)),reports:db.reports.filter(r=>r.reporter_id===session.id),notifications,reviews:db.reviews.filter(r=>r.reviewer_id===session.id),ownTasks:db.tasks.filter(t=>t.owner_id===session.id).map(H.task),favorites:await H.services.favorite.list(),unreadCount:notifications.filter(n=>!n.read_at).length,user:enrichUser(fresh)};
 },
 async notices(){
  const session=H.captureSession();if(!session.id)return {notifications:[],reports:[]};
  if(CLOUD_ENABLED){
   const [notifications,reports]=await Promise.all([
    sb.from('notifications').select('*').eq('user_id',session.id).order('created_at',{ascending:false}).limit(100),
    sb.from('reports').select('*').eq('reporter_id',session.id).order('created_at',{ascending:false})
   ]);
   if(!H.isCurrentSession(session))H.fail('SESSION_CHANGED');
   return {notifications:H.unwrap(notifications)||[],reports:H.unwrap(reports)||[]};
  }
  const db=localDb();return {notifications:db.notifications.filter(n=>n.user_id===session.id),reports:db.reports.filter(r=>r.reporter_id===session.id)};
 }
};
