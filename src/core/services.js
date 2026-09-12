/* Service boundary shared by the preserved v0.4.3 pages and v0.5 pages. */
const H = {services:{}};
// A request belongs to an identity generation, not just an ID (A -> B -> A).
H.sessionEpoch=0;
let currentUser=state.user;
Object.defineProperty(state,'user',{enumerable:true,configurable:false,
  get(){return currentUser;},
  set(user){
    if(currentUser?.id!==user?.id){
      H.sessionEpoch++;H.dataRequest=(H.dataRequest||0)+1;
      H.feedRequest=(H.feedRequest||0)+1;H.inboxSequence=(H.inboxSequence||0)+1;
      state.profile=null;state.selectedApplication=null;state.chatPeer='';
      H.historyConversation=null;H.historyCursor=null;H.historyVersion=(H.historyVersion||0)+1;
      for(const key of ['applications','messages','inbox','reports','notifications','reviews','ownTasks','favorites'])state[key]=[];
      state.chatUnread=0;state.noticeUnread=0;state.unreadCount=0;state.feedLoading=false;
      state.inboxError='';state.inboxQuery='';state.inboxFilter='all';
      if(state.route==='chat')state.route='messages';
    }
    currentUser=user;
  }
});
H.captureSession=()=>({id:state.user?.id,epoch:H.sessionEpoch});
H.isCurrentSession=token=>token.id===state.user?.id&&token.epoch===H.sessionEpoch;
H.fail = (code) => { throw new Error(code); };
H.unwrap = ({data,error}) => {if(error)throw error;return data;};
H.rpc = async(name,args={}) => H.unwrap(await sb.rpc(name,args));
H.auth = () => {if(!state.user)H.fail('请先登录');return state.user.id;};
H.localWrite = async(fn) => {
  const token=H.captureSession();
  const run=()=>{if(!H.isCurrentSession(token))H.fail('SESSION_CHANGED');const db=localDb();const result=fn(db);saveLocal(db);return result;};
  return navigator.locks ? navigator.locks.request('huoda-v050-write',run) : run();
};
H.notify=(db,user,type,title,body='',data={})=>{(db.notifications??=[]).unshift({id:uid('notice'),user_id:user,type,title,body,data,read_at:null,created_at:new Date().toISOString()});};
H.audit=(db,action,kind,id,before,after)=>{(db.audit_logs??=[]).push({id:uid('audit'),actor_id:state.user?.id,action,target_type:kind,target_id:id,before_data:before,after_data:after,created_at:new Date().toISOString()});};
H.task=(t)=>({...t,price_fen:t.price_fen??Math.round(Number(t.price)*100),price:Number(t.price_fen??Math.round(Number(t.price)*100))/100});
H.errorText=(e)=>({SESSION_CHANGED:'登录状态已变化，请重试',INVALID_PROFILE:'请检查昵称、城市、技能和头像地址',AUTH_REQUIRED:'请先登录',SELF_APPLICATION:'不能报名自己发布的任务',DUPLICATE_APPLICATION:'你已经报名过这单',TASK_UNAVAILABLE:'任务已满员、已结束或尚未通过审核',TASK_NOT_FOUND:'任务不存在或已不可见',FORBIDDEN:'你没有操作这条记录的权限',INVALID_TRANSITION:'状态已变化，请刷新后重试',DUPLICATE_REVIEW:'这单你已经评价过了',REVIEW_REQUIRES_COMPLETION:'任务完成后才能评价',MERCHANT_NOT_VERIFIED:'请先通过商家认证',LOCATION_REQUIRED:'请先授权定位',WGS84_LOCATION_REQUIRED:'请填写工作地点的 WGS84 坐标',CHAT_UNAVAILABLE:'商家发起沟通后才能聊天',INVALID_MESSAGE:'消息应为 1–2000 字',INVALID_REPORT:'请检查举报原因和补充说明',INVALID_REVIEW_STATE:'审核状态已改变，请刷新列表'})[e?.message]||e?.message||'请求失败，请重试';
