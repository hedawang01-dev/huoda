// Opt-in destructive-to-test-fixtures integration test. Use only a disposable test project.
// Needs TEST_URL, TEST_ANON_KEY, TEST_MERCHANT_EMAIL/PASSWORD,
// TEST_WORKER_EMAIL/PASSWORD, TEST_SECOND_WORKER_EMAIL/PASSWORD and TEST_TASK_ID.
// TEST_TASK_ID: approved, recruiting, exactly one remaining seat, no previous applications by these users.
const assert=require('node:assert/strict');
async function run(){const e=process.env;for(const name of ['TEST_URL','TEST_ANON_KEY','TEST_TASK_ID','TEST_MERCHANT_EMAIL','TEST_MERCHANT_PASSWORD','TEST_WORKER_EMAIL','TEST_WORKER_PASSWORD','TEST_SECOND_WORKER_EMAIL','TEST_SECOND_WORKER_PASSWORD'])if(!e[name])throw new Error('Missing '+name);
 async function login(prefix){const response=await fetch(e.TEST_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:e.TEST_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:e[prefix+'_EMAIL'],password:e[prefix+'_PASSWORD']})});const data=await response.json();if(!response.ok)throw new Error('Test login failed: '+prefix);return data.access_token;}
 async function rpc(token,name,args){const r=await fetch(e.TEST_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:e.TEST_ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args)});return {ok:r.ok,data:await r.json()};}
 const [merchant,a,b]=await Promise.all(['TEST_MERCHANT','TEST_WORKER','TEST_SECOND_WORKER'].map(login));
 const applications=await Promise.all([a,b].map(token=>rpc(token,'apply_to_task',{p_task_id:e.TEST_TASK_ID})));assert.ok(applications.every(r=>r.ok),'Both workers should apply before the seat is accepted');
 const accepted=await Promise.all(applications.map(r=>rpc(merchant,'accept_application',{p_application_id:r.data.id})));assert.equal(accepted.filter(r=>r.ok).length,1,'Exactly one concurrent accept must succeed');
 const dup=await rpc(a,'apply_to_task',{p_task_id:e.TEST_TASK_ID});assert.equal(dup.ok,false);
 console.log('LIVE PASS: two independent HTTP transactions, exactly one acceptance and duplicate rejection. Test records intentionally retained for inspection.');
}run().catch(e=>{console.error(e.message);process.exitCode=1;});
