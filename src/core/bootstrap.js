H.feedRequest=0;
window.addEventListener('storage',event=>{if(!CLOUD_ENABLED&&event.key===LS_KEY)H.refreshLive();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)H.refreshLive();});
init();
