H.services.recommendation={
 score(task,profile,location){
  if(task.recommendation_score!=null)return Number(task.recommendation_score);
  const overlap=(profile?.skills||[]).some(s=>(task.tags||[]).some(t=>t.toLowerCase()===s.toLowerCase()));
  const d=H.services.location.distance(task,location);
  return (overlap?40:0)+(d!=null&&d<=3?20:0)+(Date.now()-new Date(task.created_at).getTime()<7*86400000?5:0);
 }
};
