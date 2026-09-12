H.services.favorite={
 async list(){
  if(!state.user)return [];
  const session=H.services.auth.capture();
  if(CLOUD_ENABLED){const rows=H.unwrap(await sb.from('favorites').select('task_id').eq('user_id',session.id));H.services.auth.assertCurrent(session);return rows.map(x=>x.task_id);}
  return [...(localDb().favoritesByUser?.[session.id]||[])];
 },
 // Compatibility alias for old callers; guest favorites are no longer imported.
 async merge(){state.favorites=await this.list();return state.favorites;},
 async toggle(id){
  H.auth();const adding=!state.favorites.includes(id),session=H.services.auth.capture();
  if(CLOUD_ENABLED){H.unwrap(await(adding?sb.from('favorites').upsert({user_id:session.id,task_id:id},{onConflict:'user_id,task_id',ignoreDuplicates:true}):sb.from('favorites').delete().eq('user_id',session.id).eq('task_id',id)));H.services.auth.assertCurrent(session);}
  else await H.services.auth.localWrite(session,db=>{db.favoritesByUser??={};const old=db.favoritesByUser[session.id]||[];db.favoritesByUser[session.id]=adding?[...new Set([...old,id])]:old.filter(x=>x!==id);});
  const favorites=await this.list();H.services.auth.assertCurrent(session);state.favorites=favorites;return adding;
 },
 async tasks(){
  H.auth();
  if(!CLOUD_ENABLED)return localDb().tasks.filter(t=>state.favorites.includes(t.id)&&t.status==='recruiting'&&t.review_status==='approved');
  if(!state.favorites.length)return [];
  const session=H.captureSession();
  const rows=H.unwrap(await sb.from('tasks').select('*').in('id',state.favorites).eq('status','recruiting').eq('review_status','approved'));
  H.services.auth.assertCurrent(session);return rows.map(H.task);
 }
};
