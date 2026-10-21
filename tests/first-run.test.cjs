const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');

async function fixture(t,existingConfig){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'huoda-first-run-'));
  fs.mkdirSync(path.join(root,'scripts'));
  fs.copyFileSync(path.join(__dirname,'../scripts/serve.cjs'),path.join(root,'scripts/serve.cjs'));
  fs.copyFileSync(path.join(__dirname,'../config.example.js'),path.join(root,'config.example.js'));
  if(existingConfig!==undefined)fs.writeFileSync(path.join(root,'config.js'),existingConfig);
  const entry=path.join(root,'scripts/serve.cjs');
  const server=require(entry).createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    delete require.cache[require.resolve(entry)];
    fs.rmSync(root,{recursive:true,force:true});
  });
  const request=(route,method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
    });
    req.on('error',reject);req.end();
  });
  return {root,request};
}

test('fresh checkout serves anonymous demo config without creating or exposing a private config file',async t=>{
  const {root,request}=await fixture(t);
  const response=await request('/config.js');
  assert.equal(response.status,200);
  const context={window:{}};vm.runInNewContext(response.body,context);
  assert.equal(context.window.HUODA_CONFIG.SUPABASE_URL,'');
  assert.equal(context.window.HUODA_CONFIG.SUPABASE_KEY,'');
  assert.equal(context.window.HUODA_CONFIG.ALLOW_LOCAL_DEMO,true);
  assert.match(response.headers['content-type'],/javascript/);
  assert.equal(fs.existsSync(path.join(root,'config.js')),false);
  const head=await request('/config.js','HEAD');
  assert.equal(head.status,200);assert.equal(head.body,'');
  assert.equal((await request('/config.example.js')).status,403);
});

test('local server uses an existing config exactly and never overwrites it with the demo template',async t=>{
  const existing="window.HUODA_CONFIG = {SUPABASE_URL:'https://example.invalid', SUPABASE_KEY:'public-fixture', ENVIRONMENT:'production'};\n";
  const {root,request}=await fixture(t,existing);
  const response=await request('/config.js');
  assert.equal(response.status,200);assert.equal(response.body,existing);
  assert.equal(fs.readFileSync(path.join(root,'config.js'),'utf8'),existing);
});
