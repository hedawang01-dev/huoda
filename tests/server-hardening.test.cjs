const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createServer}=require('../scripts/serve.cjs');
test('preview server exposes application assets only, including Windows path variants',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=(pathname,method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:pathname,method},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();
  });
  try{
    for(const route of ['/','/admin/','/app.js','/src/core/services.js','/vendor/supabase-2.57.4.js'])assert.equal((await request(route)).status,200,route);
    for(const route of ['/supabase.sql','/SUPABASE.SQL','/scripts/serve.cjs','/tests/cloud-fixture.cjs','/node_modules/@supabase/supabase-js/src/index.ts','/.git/config','/%2e%67it/config','/src/core/..%5c..%5c.git%5cconfig','/supabase/functions/admin-review/index.ts','/config.example.js','/package-lock.json'])assert.equal((await request(route)).status,403,route);
    const head=await request('/app.js','HEAD');assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(head.headers['x-content-type-options'],'nosniff');
    assert.equal((await request('/app.js','POST')).status,405);
    assert.equal((await request('/%zz')).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
