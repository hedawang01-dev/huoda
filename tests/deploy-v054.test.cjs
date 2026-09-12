const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const publishableKey=`sb_publishable_${'a'.repeat(32)}`;
const expectedDist=[
  'THIRD_PARTY_NOTICES.md','admin/admin.js','admin/adminService.js','admin/index.html','app.js','config.js','index.html','responsive.css','status.css','style.css',
  'src/core/bootstrap.js','src/core/services.js','src/core/sync.js',
  'src/pages/chatHistory.js','src/pages/community.js','src/pages/messages.js','src/pages/responsive.js',
  'src/services/accountService.js','src/services/applicationService.js','src/services/authService.js',
  'src/services/favoriteService.js','src/services/inboxService.js','src/services/locationService.js',
  'src/services/merchantService.js','src/services/messageService.js','src/services/notificationService.js',
  'src/services/recommendationService.js','src/services/reportService.js','src/services/reviewService.js',
  'src/services/taskService.js','vendor/DEPENDENCY_LICENSES.txt','vendor/SUPABASE-LICENSE.txt',
  'vendor/supabase-2.57.4.js'
].sort();

function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'huoda-deploy-v054-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const relative of [
    'index.html','app.js','style.css','responsive.css','status.css','THIRD_PARTY_NOTICES.md','admin','src','vendor',
    'scripts/build.cjs','scripts/verify-dist.cjs'
  ]){
    const source=path.join(root,...relative.split('/'));
    const target=path.join(directory,...relative.split('/'));
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.cpSync(source,target,{recursive:true});
  }
  return directory;
}

function cleanEnvironment(overrides={}){
  const env={...process.env};
  for(const name of Object.keys(env))if(name.toUpperCase().startsWith('HUODA_'))delete env[name];
  for(const [name,value] of Object.entries(overrides)){
    if(value===undefined)delete env[name];
    else env[name]=String(value);
  }
  return env;
}

function runScript(cwd,script,args=[],environment={}){
  return spawnSync(process.execPath,[script,...args],{
    cwd,
    env:cleanEnvironment(environment),
    encoding:'utf8',
    windowsHide:true
  });
}

function build(cwd,{args=[],url,key}={}){
  return runScript(cwd,'scripts/build.cjs',args,{
    HUODA_SUPABASE_URL:url,
    HUODA_SUPABASE_PUBLISHABLE_KEY:key
  });
}

function output(result){return `${result.stdout||''}\n${result.stderr||''}`;}
function assertFailed(result,pattern){
  assert.equal(result.status,1,output(result));
  assert.match(output(result),pattern);
}

function walk(directory,prefix=''){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const relative=prefix?`${prefix}/${entry.name}`:entry.name;
    return entry.isDirectory()?walk(path.join(directory,entry.name),relative):[relative];
  });
}

function exactFile(directory,relative){
  let current=directory;
  for(const segment of relative.split('/')){
    if(!fs.existsSync(current)||!fs.statSync(current).isDirectory())return false;
    if(!fs.readdirSync(current).includes(segment))return false;
    current=path.join(current,segment);
  }
  return fs.existsSync(current)&&fs.statSync(current).isFile();
}

function readConfig(directory){
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(directory,'dist/config.js'),'utf8'),sandbox,{timeout:1000});
  return sandbox.window.HUODA_CONFIG;
}

function htmlReferences(html){
  return [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map(match=>match[1]);
}

test('production build rejects absent and partial Supabase configuration without creating dist',t=>{
  for(const scenario of [
    {name:'both missing'},
    {name:'URL only',url:'https://huoda-test.supabase.co'},
    {name:'key only',key:publishableKey}
  ]){
    const directory=fixture(t);
    const result=build(directory,scenario);
    assertFailed(result,/production requires|must be provided together/i);
    assert.equal(fs.existsSync(path.join(directory,'dist')),false,`${scenario.name} left a deployable dist`);
  }
});

test('production build accepts HTTPS and rejects every non-HTTPS Supabase URL',t=>{
  for(const url of ['http://huoda-test.supabase.co','ftp://huoda-test.supabase.co','huoda-test.supabase.co']){
    const directory=fixture(t);
    assertFailed(build(directory,{url,key:publishableKey}),/valid HTTPS URL|must use HTTPS|clean HTTPS URL/i);
  }

  const directory=fixture(t);
  const result=build(directory,{url:'https://huoda-test.supabase.co',key:publishableKey});
  assert.equal(result.status,0,output(result));
  assert.equal(readConfig(directory).ENVIRONMENT,'production');
});

test('browser build rejects Supabase secret, service-role text and service-role JWT keys',t=>{
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const serviceRoleJwt=`${encoded({alg:'HS256',typ:'JWT'})}.${encoded({role:'service_role'})}.test-signature`;
  for(const key of [
    `sb_secret_${'b'.repeat(32)}`,
    `service_role_${'c'.repeat(32)}`,
    serviceRoleJwt
  ]){
    const directory=fixture(t);
    assertFailed(build(directory,{url:'https://huoda-test.supabase.co',key}),/Service Role or secret key/i);
    assert.equal(fs.existsSync(path.join(directory,'dist')),false,'rejected secret left a deployable dist');
  }
});

test('explicit local demo build succeeds and emits a non-production configuration',t=>{
  const directory=fixture(t);
  const result=build(directory,{args:['--allow-local-demo']});
  assert.equal(result.status,0,output(result));
  assert.match(output(result),/local demo/i);
  assert.deepEqual({...readConfig(directory)},
    {
      SUPABASE_URL:'',SUPABASE_KEY:'',ENVIRONMENT:'local-demo',ALLOW_LOCAL_DEMO:true,
      CITY:'广州',DEFAULT_LAT:23.1291,DEFAULT_LNG:113.2644
    });
});

test('dist is an exact static allowlist and excludes source, SQL, tests, scripts and environment files',t=>{
  const directory=fixture(t);
  const built=build(directory,{args:['--allow-local-demo']});
  assert.equal(built.status,0,output(built));
  const dist=path.join(directory,'dist');
  const actual=walk(dist).sort();
  assert.deepEqual(actual,expectedDist);

  for(const forbidden of [
    'supabase.sql','package.json','.env','.env.example','config.example.js',
    'tests/deploy-v054.test.cjs','scripts/build.cjs','supabase/functions/admin-review/index.ts'
  ])assert.equal(exactFile(dist,forbidden),false,`forbidden artifact published: ${forbidden}`);

  for(const relative of expectedDist.filter(file=>file!=='config.js')){
    assert.deepEqual(
      fs.readFileSync(path.join(dist,...relative.split('/'))),
      fs.readFileSync(path.join(directory,...relative.split('/'))),
      `${relative} changed while being copied into dist`
    );
  }

  const verified=runScript(directory,'scripts/verify-dist.cjs');
  assert.equal(verified.status,0,output(verified));
});

test('index and admin references resolve to exact-case allowlisted files',t=>{
  const directory=fixture(t);
  const built=build(directory,{args:['--allow-local-demo']});
  assert.equal(built.status,0,output(built));
  const dist=path.join(directory,'dist');

  for(const htmlFile of ['index.html','admin/index.html']){
    const html=fs.readFileSync(path.join(dist,...htmlFile.split('/')),'utf8');
    const base=path.posix.dirname(htmlFile);
    for(const reference of htmlReferences(html)){
      const relative=path.posix.normalize(path.posix.join(base,reference));
      assert.equal(relative.startsWith('../'),false,`${htmlFile} escapes dist via ${reference}`);
      assert.equal(exactFile(dist,relative),true,`${htmlFile} has missing or wrong-case resource ${reference}`);
      assert.ok(expectedDist.includes(relative),`${htmlFile} references a file outside the allowlist: ${relative}`);
    }
  }

  const appJs=fs.readFileSync(path.join(dist,'app.js'),'utf8');
  const adminServiceJs=fs.readFileSync(path.join(dist,'admin/adminService.js'),'utf8');
  assert.match(appJs,/script\.src=['"]vendor\/supabase-2\.57\.4\.js['"]/);
  assert.match(adminServiceJs,/s\.src=['"]\.\.\/vendor\/supabase-2\.57\.4\.js['"]/);
  assert.equal(exactFile(dist,'vendor/supabase-2.57.4.js'),true);

  for(const wrongCase of ['Index.html','Admin/index.html','admin/Admin.js','SRC/core/bootstrap.js']){
    assert.equal(exactFile(dist,wrongCase),false,`wrong-case path unexpectedly passed: ${wrongCase}`);
  }
});

test('vercel publishes dist with the production build and keeps /admin resources resolvable',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.equal(config.outputDirectory,'dist');
  assert.equal(config.buildCommand,'npm run build');
  assert.equal(config.framework,null);
  const globalHeaders=config.headers.find(rule=>rule.source==='/(.*)')?.headers||[];
  const headerMap=Object.fromEntries(globalHeaders.map(header=>[header.key,header.value]));
  assert.equal(headerMap['X-Frame-Options'],'DENY');
  assert.match(headerMap['Content-Security-Policy']||'',/frame-ancestors 'none'/);

  const rewrite=config.rewrites?.find(rule=>rule.source==='/admin');
  const redirect=config.redirects?.find(rule=>rule.source==='/admin');
  assert.ok(rewrite||redirect,'Vercel must handle the extensionless /admin route');

  const adminHtml=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
  const explicitBase=adminHtml.match(/<base\s+href=["']([^"']+)["']/i)?.[1];
  const visibleUrl=redirect
    ?new URL(redirect.destination,'https://huoda.example')
    :new URL('/admin','https://huoda.example');
  const documentBase=explicitBase?new URL(explicitBase,visibleUrl):visibleUrl;
  const publicFiles=new Set(expectedDist.map(file=>`/${file}`));

  for(const reference of htmlReferences(adminHtml)){
    const resolved=new URL(reference,documentBase).pathname;
    assert.ok(publicFiles.has(resolved),
      `/admin routing resolves ${reference} to ${resolved}; route to /admin/ or provide a safe admin base path`);
  }

  if(rewrite)assert.equal(rewrite.destination,'/admin/index.html');
  if(redirect)assert.equal(new URL(redirect.destination,'https://huoda.example').pathname,'/admin/');
});
