H.services.auth={
 capture(){H.auth();return H.captureSession();},
 assertCurrent(session){if(!H.isCurrentSession(session))H.fail('SESSION_CHANGED');},
 localWrite(session,fn){return H.localWrite(db=>{this.assertCurrent(session);return fn(db);});},
 async hydrate(user){
  if(!user?.id)H.fail('AUTH_REQUIRED');
  state.user=user;
  const session=this.capture(),sequence=H.authSequence=(H.authSequence||0)+1;
  const p=H.unwrap(await sb.from('profiles').select('id,name,city,skills,avatar_url,current_mode,created_at').eq('id',user.id).single());this.assertCurrent(session);
  const w=H.unwrap(await sb.from('worker_profiles').select('*').eq('user_id',user.id).maybeSingle());this.assertCurrent(session);
  const m=H.unwrap(await sb.from('merchant_profiles').select('*').eq('user_id',user.id).maybeSingle());this.assertCurrent(session);
  if(sequence!==H.authSequence)return false;
  state.profile={...p,...(w||{}),...(m||{}),id:user.id,role:p.current_mode,skills:w?.skills||p.skills,verification_status:m?.verification_status||'unverified'};
  return true;
 },
 async save(patch){
  const session=this.capture();
  // Match save_my_profile: identity and verification are never editable here.
  const editable={};
  for(const key of ['name','city','current_mode','skills','bio','avatar_url'])if(Object.hasOwn(patch,key))editable[key]=patch[key];
  const p={...state.profile,...editable},mode=p.current_mode||p.role,skills=p.skills||[],bio=p.bio??'',avatar=p.avatar_url??'';
  if(typeof p.name!=='string'||Array.from(p.name.trim()).length<1||Array.from(p.name.trim()).length>60||typeof p.city!=='string'||Array.from(p.city).length<1||Array.from(p.city).length>60||!['worker','merchant'].includes(mode)||!Array.isArray(skills)||skills.length>8||skills.some(s=>typeof s!=='string')||typeof bio!=='string'||Array.from(bio).length>1000||typeof avatar!=='string'||(avatar!==''&&!avatar.startsWith('https://')))H.fail('INVALID_PROFILE');
  const values={name:p.name.trim(),city:p.city,current_mode:mode,skills:[...skills],bio,avatar_url:avatar};
  if(CLOUD_ENABLED){
   await H.rpc('save_my_profile',{p_name:values.name,p_city:values.city,p_mode:mode,p_skills:skills,p_bio:bio,p_avatar:avatar});
   this.assertCurrent(session);await this.hydrate(state.user);
  }else await this.localWrite(session,db=>{
   const u=db.users.find(u=>u.id===session.id);if(!u)H.fail('AUTH_REQUIRED');
   Object.assign(u,values);u.role=mode;state.profile=enrichUser(u);state.user=u;
  });
 },
 async current(){
  if(CLOUD_ENABLED){const result=await sb.auth.getSession();if(result.error)throw result.error;return result.data.session?.user||null;}
  return localDb().users.find(u=>u.active)||null;
 },
 onChange(handler){
  if(!CLOUD_ENABLED)return {data:{subscription:{unsubscribe(){}}}};
  return sb.auth.onAuthStateChange((event,session)=>handler(event,session));
 },
 async credentials(mode,{email,password,name}){
  if(CLOUD_ENABLED){
   if(mode==='signup'){
    const result=await sb.auth.signUp({email,password,options:{data:{name,role:'worker'}}});if(result.error)throw result.error;
    return {user:result.data.user||null,session:result.data.session||null,needsEmailVerification:!result.data.session};
   }
   const result=await sb.auth.signInWithPassword({email,password});if(result.error)throw result.error;return {user:result.data.user,session:result.data.session};
  }
  const db=localDb();let user=db.users.find(u=>u.email===email);
  if(mode==='signup'){
   if(user)H.fail('该邮箱已注册');
   user=enrichUser({id:uid('user'),email,name,role:'worker',city:CFG.CITY||'广州',skills:[],active:true});db.users.push(user);
  }else if(!user)H.fail('本地账号不存在，请先注册');
  db.users.forEach(u=>u.active=u.id===user.id);saveLocal(db);return {user};
 },
 async demo(role='worker'){
  if(CLOUD_ENABLED)H.fail('云端模式请用邮箱注册；演示账号只用于本地模式');
  const db=localDb(),id=role==='merchant'?'merchant-demo':'worker-demo';let user=db.users.find(u=>u.id===id);
  if(!user){user=enrichUser({id,name:role==='merchant'?'南屿电商（演示）':'小何（演示）',email:`${id}@demo.local`,role,city:CFG.CITY||'广州',skills:role==='worker'?['PS','电商设计']:[],verification_status:role==='merchant'?'verified':'unverified',company_name:role==='merchant'?'南屿电商':'',active:true});db.users.push(user);}
  if(role==='merchant')Object.assign(user,{role:'merchant',current_mode:'merchant',verification_status:'verified',company_name:user.company_name||'南屿电商'});
  db.users.forEach(u=>u.active=u.id===id);saveLocal(db);return user;
 },
 async signOut(){
  if(CLOUD_ENABLED){const result=await sb.auth.signOut();if(result.error)throw result.error;return;}
  const db=localDb();db.users.forEach(u=>u.active=false);saveLocal(db);
 }
};
