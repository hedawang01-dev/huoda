const {test}=require('node:test');
const assert=require('node:assert/strict');
const makeFixture=require('./cloud-fixture.cjs');

test('v5.4 PostgreSQL lifecycle: task, application, chat, review and report contracts',async()=>{
 const fixture=await makeFixture();
 try{
  await fixture.admin(async db=>{
   const {merchant,worker,admin}=fixture.ids;
   const as=async(id,role='authenticated')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role]);
    await db.exec('set role '+role);
   };
   const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
   const payload={type:'online',title:'5.4 生命周期数据库验收',price_fen:28800,price_unit:'次',pay_mode:'完工结',settlement:'验收后结算',time_text:'三天内交付',location:'线上',city:'广州',description:'交付可编辑源文件',tags:['设计'],spots_total:1,schedule_type:'deadline'};

   await as(merchant);
   const draft=await scalar('select to_jsonb(public.create_task_v054($1,false))',[JSON.stringify(payload)]);
   assert.equal(draft.status,'draft');
   assert.equal(draft.review_status,'pending');

   await as('', 'anon');
   assert.equal((await scalar("select public.search_tasks_v054(keyword=>'5.4 生命周期数据库验收')")).total,0);

   await as(merchant);
   const submitted=await scalar("select to_jsonb(public.transition_task_v054($1,'pending_review'))",[draft.id]);
   assert.equal(submitted.status,'pending_review');

   await as('', 'service_role');
   await db.query("select public.admin_moderate($1,'task',$2,'approved')",[admin,draft.id]);
   await as('', 'anon');
   assert.equal(await scalar('select status from public.tasks where id=$1',[draft.id]),'recruiting');

   assert.equal((await scalar("select public.search_tasks_v054(keyword=>'5.4 生命周期数据库验收')")).total,1);

   await as(worker);
   const application=await scalar('select to_jsonb(public.apply_to_task_v054($1))',[draft.id]);
   assert.equal(application.status,'applied');

   await as(merchant);
   assert.equal((await scalar("select to_jsonb(public.transition_application_v054($1,'viewed'))",[application.id])).status,'viewed');
   assert.equal((await scalar("select to_jsonb(public.transition_application_v054($1,'communicating'))",[application.id])).status,'communicating');
   assert.equal((await scalar("select to_jsonb(public.send_text_message_v054($1,'请确认交付要求'))",[application.id])).message_type,'text');
   assert.equal((await scalar("select to_jsonb(public.transition_application_v054($1,'accepted'))",[application.id])).status,'accepted');
   assert.deepEqual((await db.query('select status,spots_left from public.tasks where id=$1',[draft.id])).rows[0],{status:'full',spots_left:0});

   await as(worker);
   const completed=await scalar("select to_jsonb(public.transition_application_v054($1,'completed'))",[application.id]);
   assert.equal(completed.status,'completed');
   assert.equal(completed.completed_by,worker);
   assert.ok(completed.completed_at);
   await assert.rejects(db.query("select public.send_text_message_v054($1,'完成后不应继续聊天')",[application.id]),/CHAT_UNAVAILABLE/);
   await db.query("select public.submit_review($1,5,array['准时'],'合作顺利')",[application.id]);
   await db.query("select public.submit_report($1,'信息核验','参与者可以举报已参与任务')",[draft.id]);

   await as(merchant);
   assert.equal((await scalar("select to_jsonb(public.transition_task_v054($1,'ended'))",[draft.id])).status,'ended');
   const closing=await scalar('select to_jsonb(public.create_task_v054($1,true))',[JSON.stringify({...payload,title:'下架时结束未决报名'})]);
   await as('', 'service_role');
   await db.query("select public.admin_moderate($1,'task',$2,'approved')",[admin,closing.id]);
   await as(worker);
   const pending=await scalar('select to_jsonb(public.apply_to_task_v054($1))',[closing.id]);
   await as(merchant);
   assert.equal((await scalar("select to_jsonb(public.transition_task_v054($1,'taken_down'))",[closing.id])).status,'taken_down');
   assert.equal(await scalar('select status from public.applications where id=$1',[pending.id]),'rejected');
   const removable=await scalar('select to_jsonb(public.create_task_v054($1,false))',[JSON.stringify({...payload,title:'可下架草稿'})]);
   assert.equal((await scalar("select to_jsonb(public.transition_task_v054($1,'taken_down'))",[removable.id])).status,'taken_down');

   const taskStatuses=(await db.query("select pg_get_constraintdef(oid) definition from pg_constraint where conname='tasks_status_check'")).rows[0].definition;
   const applicationStatuses=(await db.query("select pg_get_constraintdef(oid) definition from pg_constraint where conname='applications_status_check'")).rows[0].definition;
   for(const status of ['draft','pending_review','recruiting','full','ended','taken_down'])assert.match(taskStatuses,new RegExp(status));
   for(const status of ['applied','viewed','communicating','accepted','rejected','completed','cancelled'])assert.match(applicationStatuses,new RegExp(status));
  });
 }finally{await fixture.close();}
});
