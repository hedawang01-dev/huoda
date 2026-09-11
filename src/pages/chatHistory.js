// One bounded page per request. Loaded history stays in this conversation only.
H.messageOrder=(a,b)=>{
 const time=new Date(a.created_at)-new Date(b.created_at);
 if(time)return time;
 const fraction=value=>Number((String(value).match(/\.(\d+)/)?.[1]||'').padEnd(6,'0').slice(0,6));
 return fraction(a.created_at)-fraction(b.created_at)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
};
H.applyConversationPage=(data,{reset=false,older=false}={})=>{
 const id=data.application.id,existing=state.messages.filter(m=>m.application_id===id);
 const same=H.historyConversation===id;
 const overlap=data.messages.some(m=>existing.some(old=>old.id===m.id));
 // If more than a page arrived between refreshes, restart the contiguous
 // window so the older-page cursor cannot silently skip the intervening gap.
 const replace=reset||!same||(!older&&existing.length>0&&data.messages.length>0&&!overlap);
 state.messages=replace?[...data.messages]:[...new Map([...existing,...data.messages].map(m=>[m.id,m])).values()].sort(H.messageOrder);
 if(replace||older){H.historyCursor=data.next_cursor||null;H.historyVersion=(H.historyVersion||0)+1;}
 H.historyConversation=id;state.selectedApplication=data.application;
};
H.renderHistoryControl=()=>{
 const list=app.querySelector('.chat-list');if(!list||H.historyConversation!==state.selectedApplication?.id||!H.historyCursor)return;
 const button=document.createElement('button');button.type='button';button.className='chat-history-more secondary';button.id='chatHistoryMore';
 const pending=H.historyPending?.id===H.historyConversation;
 button.textContent=pending?'正在加载历史…':'查看更早的消息';button.disabled=pending;
 button.addEventListener('click',loadOlderMessages);list.prepend(button);
};
async function loadOlderMessages(){
 const id=state.selectedApplication?.id,cursor=H.historyCursor;if(!id||!cursor||H.historyPending)return;
 const pending={id},session=H.captureSession(),version=H.historyVersion;
 H.historyPending=pending;
 const button=document.getElementById('chatHistoryMore');if(button){button.disabled=true;button.textContent='正在加载历史…';}
 try{
  const data=await H.services.inbox.conversation(id,{before:cursor});
  if(!H.isCurrentSession(session)||state.route!=='chat'||state.selectedApplication?.id!==id||H.historyVersion!==version)return;
  const list=app.querySelector('.chat-list'),height=list?.scrollHeight||0,scroll=list?.scrollTop||0,documentHeight=document.documentElement.scrollHeight,pageScroll=scrollY;
  saveVisibleDrafts();H.applyConversationPage(data,{older:true});H.historyPending=null;chat();
  if(H.desktop()){const next=app.querySelector('.chat-list');if(next)next.scrollTop=scroll+next.scrollHeight-height;}
  else scrollTo(0,pageScroll+document.documentElement.scrollHeight-documentHeight);
 }catch(e){if(H.isCurrentSession(session)&&state.route==='chat'&&state.selectedApplication?.id===id)toast(H.errorText(e));}
 finally{if(H.historyPending===pending)H.historyPending=null;const current=document.getElementById('chatHistoryMore');if(current&&!H.historyPending){current.disabled=false;current.textContent='查看更早的消息';}}
}
