H.services.favorite={
 async list(){
  if(!state.user)return loadFavorites();
  const session=H.services.auth.capture();
  if(CLOUD_ENABLED){const rows=H.unwrap(await sb.from('favorites').select('task_id').eq('user_id',session.id));H.services.auth.assertCurrent(session);return rows.map(x=>x.task_id);}
  return [...(localDb().favoritesByUser?.[session.id]||[])];
 },
 async merge(){
  if(!state.user)return;
  const session=H.services.auth.capture(),guest=loadFavorites();
  if(guest.length){
   if(CLOUD_ENABLED){
    const valid=[...new Set(guest.filter(x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)))];
    for(const id of valid){
     H.services.auth.assertCurrent(session);
     const {data,error}=await sb.from('tasks').select('id').eq('id',id).eq('status','open').eq('review_status','approved').maybeSingle();
     H.services.auth.assertCurrent(session);if(error)throw error;
     if(data){H.unwrap(await sb.from('favorites').upsert({user_id:session.id,task_id:id},{onConflict:'user_id,task_id',ignoreDuplicates:true}));H.services.auth.assertCurrent(session);}
    }
   }else await H.services.auth.localWrite(session,db=>{
    db.favoritesByUser??={};db.favoritesByUser[session.id]=[...new Set([...(db.favoritesByUser[session.id]||[]),...guest])];
   });
  }
  const favorites=await this.list();H.services.auth.assertCurrent(session);
  // Preserve guest edits made in another tab while the merge was in flight.
  if(guest.length&&JSON.stringify(loadFavorites())===JSON.stringify(guest))localStorage.removeItem(FAV_KEY);
  state.favorites=favorites;
 },
 async toggle(id){
  const adding=!state.favorites.includes(id);
  if(!state.user){state.favorites=adding?[...state.favorites,id]:state.favorites.filter(x=>x!==id);saveFavorites();return adding;}
  const session=H.services.auth.capture();
  if(CLOUD_ENABLED){H.unwrap(await(adding?sb.from('favorites').upsert({user_id:session.id,task_id:id},{onConflict:'user_id,task_id',ignoreDuplicates:true}):sb.from('favorites').delete().eq('user_id',session.id).eq('task_id',id)));H.services.auth.assertCurrent(session);}
  else await H.services.auth.localWrite(session,db=>{db.favoritesByUser??={};const old=db.favoritesByUser[session.id]||[];db.favoritesByUser[session.id]=adding?[...new Set([...old,id])]:old.filter(x=>x!==id);});
  const favorites=await this.list();H.services.auth.assertCurrent(session);state.favorites=favorites;return adding;
 },
 async tasks(){
  if(!CLOUD_ENABLED)return localDb().tasks.filter(t=>state.favorites.includes(t.id)&&t.status==='open'&&t.review_status==='approved');
  if(!state.favorites.length)return [];
  const session=H.captureSession();
  const rows=H.unwrap(await sb.from('tasks').select('*').in('id',state.favorites).eq('status','open').eq('review_status','approved'));
  H.services.auth.assertCurrent(session);return rows.map(H.task);
 }
};
