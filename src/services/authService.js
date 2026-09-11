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
 }
};
