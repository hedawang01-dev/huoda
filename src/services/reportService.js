H.services.report={
 async submit(taskId,reason,detail=''){
  const user=H.auth(),cleanReason=String(reason||'').trim(),cleanDetail=String(detail||'').trim();
  if(!cleanReason||Array.from(cleanReason).length>120||Array.from(cleanDetail).length>2000)H.fail('INVALID_REPORT');
  if(CLOUD_ENABLED)return H.rpc('submit_report',{p_task_id:taskId,p_reason:cleanReason,p_detail:cleanDetail});
  return H.localWrite(db=>{
   const task=db.tasks.find(t=>String(t.id)===String(taskId));
   if(!task)H.fail('TASK_NOT_FOUND');
   const report={id:uid('report'),reporter_id:user,task_id:taskId,reason:cleanReason,detail:cleanDetail,status:'open',created_at:new Date().toISOString()};
   db.reports.unshift(report);H.audit(db,'reported','report',report.id,null,report);return report;
  });
 }
};
