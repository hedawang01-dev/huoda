/* Realtime invalidates cached views; all data is read again from the service. */
H.syncBusy=false;
H.syncStatus=(kind,message='')=>{
 const box=document.getElementById('syncStatus');if(!box)return;
 box.hidden=!message;box.dataset.kind=kind;
 const text=box.querySelector('span');if(text)text.textContent=message;
 const retry=box.querySelector('button');if(retry)retry.hidden=kind==='offline';
};
H.refreshLive=()=>{
 clearTimeout(H.liveTimer);
 H.liveTimer=setTimeout(async()=>{
  if(CLOUD_ENABLED&&!navigator.onLine){H.syncStatus('offline','网络已断开，当前内容可能不是最新。联网后会自动更新。');return;}
  if(H.syncBusy){H.refreshLive();return;}
  H.syncBusy=true;
  const route=state.route,session=H.captureSession();
  const current=()=>state.route===route&&H.isCurrentSession(session);
  try{
   if(route==='chat'&&state.selectedApplication){
    const id=state.selectedApplication.id,input=document.getElementById('chatText'),draft=input?.value||'',focused=document.activeElement===input,start=input?.selectionStart,end=input?.selectionEnd;
    const list=document.querySelector('.chat-list'),scroll=list?.scrollTop||0,pageScroll=scrollY;
    const atEnd=H.desktop()?list&&list.scrollHeight-list.scrollTop-list.clientHeight<100:innerHeight+scrollY>=document.documentElement.scrollHeight-160;
    if(!document.hidden)await H.services.message.read(id);
    if(!current()||state.selectedApplication?.id!==id)return;
    const data=await H.services.inbox.conversation(id);await H.services.inbox.load();
    if(!current()||state.selectedApplication?.id!==id)return;
    const currentInput=document.getElementById('chatText'),text=currentInput?.value??draft,isFocused=document.activeElement===currentInput;
    H.applyConversationPage(data);chat();const next=document.getElementById('chatText');
    if(next){next.value=text;if(isFocused||focused){next.focus({preventScroll:true});next.setSelectionRange(currentInput?.selectionStart??start,currentInput?.selectionEnd??end);}}
    if(atEnd)scrollChatToLatest();else if(H.desktop()){const refreshed=document.querySelector('.chat-list');if(refreshed)refreshed.scrollTop=scroll;}else scrollTo(0,pageScroll);
   }else if(route==='messages'){
    const success=await refreshMessages();if(success===false)return;
   }else{
    if(await loadData()===false||!current())return;
    if(route==='home')refreshHomeResults();
    else if(route==='detail'&&state.selectedTask){
     const id=state.selectedTask.id;
     try{const task=await H.services.task.get(id);if(current()&&state.selectedTask?.id===id){state.selectedTask=task;render();}}
     catch(e){if(current()&&state.selectedTask?.id===id){
      // A network failure is not evidence that the task has closed.
      if(['PGRST116','TASK_UNAVAILABLE'].includes(e?.code)||e?.message==='TASK_UNAVAILABLE'){state.selectedTask=null;go('home');toast('任务状态已更新，暂不可报名');}
      else throw e;
     }}
    }else if(route==='publicProfile'&&state.publicProfileId){
     const id=state.publicProfileId,kind=state.publicProfileKind,data=await H.services.merchant.publicProfile(id,kind);
     if(current()&&state.publicProfileId===id){state.publicProfileData=data;render();}
    }else if(['orders','favorites','profile'].includes(route)&&!modalRoot.childElementCount)render();
    else if(route==='publish'&&state.publishTab==='mine'&&!modalRoot.childElementCount)render();
   }
   if(current()){updateHeader();H.syncStatus('ok');}
  }catch(e){if(current()){if(CLOUD_ENABLED)H.syncStatus('error','暂时无法更新，已保留当前内容。请检查网络后重试。');else toast(H.errorText(e));}}
  finally{H.syncBusy=false;}
 },180);
};
window.addEventListener('offline',()=>{if(CLOUD_ENABLED)H.syncStatus('offline','网络已断开，当前内容可能不是最新。联网后会自动更新。');});
window.addEventListener('online',()=>{if(CLOUD_ENABLED){H.syncStatus('reconnecting','网络已恢复，正在更新…');H.refreshLive();}});
window.addEventListener('focus',()=>{if(CLOUD_ENABLED)H.refreshLive();});
setInterval(()=>{if(CLOUD_ENABLED&&!document.hidden)H.refreshLive();},15000);
