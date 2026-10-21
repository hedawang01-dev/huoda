const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {checkPublication,packPublication,assertPortablePaths}=require('../scripts/publication.cjs');
const temporaryRoot=fs.realpathSync(os.tmpdir());

function fixture(t){
  const root=fs.mkdtempSync(path.join(temporaryRoot,'huoda-publication-'));
  t.after(()=>{
    assert.ok(root.startsWith(temporaryRoot+path.sep));
    fs.rmSync(root,{recursive:true,force:true});
  });
  for(const relative of ['LICENSE','README.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md','index.html','app.js','config.example.js','supabase.sql','vendor/SUPABASE-LICENSE.txt','vendor/DEPENDENCY_LICENSES.txt','vendor/supabase-2.57.4.js']){
    const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(__dirname,'..',relative),target);
  }
  const metadata={name:'huoda-fixture',version:'0.5.4',license:'PolyForm-Noncommercial-1.0.0',dependencies:{},devDependencies:{}};
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({...metadata,private:true}));
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{'':metadata}}));
  return root;
}

test('publication package excludes private configuration and caches, preserves every copied byte, and never overwrites a destination',t=>{
  const root=fixture(t);
  const privateValue='ghp_'+'a'.repeat(36);
  fs.writeFileSync(path.join(root,'.env'),'TOKEN='+privateValue);
  fs.writeFileSync(path.join(root,'config.js'),'private local configuration');
  fs.mkdirSync(path.join(root,'node_modules'));fs.writeFileSync(path.join(root,'node_modules','private.js'),privateValue);
  fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs','local.sqlite'),'private database');
  const output=path.join(root,'.local','candidate');
  const result=packPublication(root,output);
  assert.equal(fs.existsSync(path.join(result.sourceDirectory,'.env')),false);
  assert.equal(fs.existsSync(path.join(result.sourceDirectory,'config.js')),false);
  assert.equal(fs.existsSync(path.join(result.sourceDirectory,'node_modules')),false);
  assert.equal(fs.existsSync(path.join(result.sourceDirectory,'docs','local.sqlite')),false);
  assert.equal(fs.existsSync(path.join(result.sourceDirectory,'supabase.sql')),true,'A fresh database needs the baseline SQL in the publication source.');
  assert.deepEqual(fs.readFileSync(path.join(result.sourceDirectory,'LICENSE')),fs.readFileSync(path.join(root,'LICENSE')));
  assert.equal(checkPublication(result.sourceDirectory).files.length,result.files.length);
  const original=fs.readFileSync(path.join(result.sourceDirectory,'README.md'));
  assert.throws(()=>packPublication(root,output),/already exists/i);
  assert.deepEqual(fs.readFileSync(path.join(result.sourceDirectory,'README.md')),original);
});

test('publication check blocks secret-like active source and personal paths without echoing the matched values',t=>{
  const root=fixture(t);fs.mkdirSync(path.join(root,'src'));
  const target=path.join(root,'src','fixture.js');
  const cases=[
    'ghp_'+'b'.repeat(36),
    'sb_secret_'+'c'.repeat(32),
    ['-----BEGIN ','PRIVATE KEY-----'].join(''),
    ['C:','Users','PrivateFixture','workspace'].join('\\'),
    ['C:','Users',"Private'Fixture",'workspace'].join('\\'),
    ['C:','Users','Private Fixture','workspace'].join('\\')
  ];
  for(const value of cases){
    fs.writeFileSync(target,JSON.stringify(value));
    let error;try{checkPublication(root);}catch(e){error=e;}
    assert.ok(error instanceof Error);
    assert.match(error.message,/src\/fixture\.js/);
    assert.equal(error.message.includes(value),false);
  }
});

test('publication check rejects inconsistent package licenses before creating any output',t=>{
  const root=fixture(t);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  pkg.license='MIT';fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
  const output=path.join(root,'.local','candidate');
  assert.throws(()=>packPublication(root,output),/license|metadata/i);
  assert.equal(fs.existsSync(output),false);
});

test('publication excludes Supabase CLI local connection metadata from the source package',t=>{
  const root=fixture(t),privateDirectory=path.join(root,'supabase','.temp');
  fs.mkdirSync(privateDirectory,{recursive:true});
  fs.writeFileSync(path.join(privateDirectory,'pooler-url'),['postgresql://fixture',':','fixture-secret','@','invalid.test/db'].join(''));
  const result=packPublication(root,path.join(root,'.local','candidate'));
  assert.equal(fs.existsSync(path.join(result.sourceDirectory,'supabase','.temp')),false);
  assert.equal(result.files.some(item=>item.path.startsWith('supabase/.temp/')),false);
});

test('publication CLI honors a positional output directory forwarded by npm on Windows and its direct --output form',t=>{
  const root=fixture(t),script=path.join(root,'scripts','publication.cjs');
  fs.mkdirSync(path.dirname(script));fs.copyFileSync(path.join(__dirname,'..','scripts','publication.cjs'),script);
  for(const args of [['pack','.local/chosen'],['pack','--output','.local/explicit']]){
    const result=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const output=args.at(-1);
    assert.equal(fs.existsSync(path.join(root,output,'source','supabase.sql')),true);
  }
  assert.equal(fs.existsSync(path.join(root,'.local','publication-candidate')),false);
});

test('publication CLI rejects malformed output arguments before creating a destination',t=>{
  const root=fixture(t),script=path.join(root,'scripts','publication.cjs');
  fs.mkdirSync(path.dirname(script));fs.copyFileSync(path.join(__dirname,'..','scripts','publication.cjs'),script);
  for(const args of [['pack','--output'],['pack','--unknown'],['pack','.local/one','.local/two'],['pack','--output','.local/one','extra']]){
    const result=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'});
    assert.notEqual(result.status,0,args.join(' '));
  }
  assert.equal(fs.existsSync(path.join(root,'.local')),false);
});

test('publication check rejects a modified standard license',t=>{
  const root=fixture(t),license=path.join(root,'LICENSE'),original=fs.readFileSync(license,'utf8');
  fs.writeFileSync(license,original.replace(/\r?\n/g,'\r\n'));
  assert.doesNotThrow(()=>checkPublication(root),'Legal text is unchanged by CRLF checkout.');
  fs.appendFileSync(license,'\nModified license.\n');
  assert.throws(()=>checkPublication(root),/license/i);
});

test('publication refuses linked output ancestors without writing to their target',t=>{
  const root=fixture(t),outside=fs.mkdtempSync(path.join(temporaryRoot,'huoda-output-target-'));
  t.after(()=>{assert.ok(outside.startsWith(temporaryRoot+path.sep));fs.rmSync(outside,{recursive:true,force:true});});
  fs.mkdirSync(path.join(root,'.local'));
  fs.symlinkSync(outside,path.join(root,'.local','linked'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>packPublication(root,path.join(root,'.local','linked','candidate')),/link|boundary/i);
  assert.equal(fs.existsSync(path.join(outside,'candidate')),false);
});

test('portable publication paths reject conflicting directory casing across operating systems',()=>{
  assert.throws(()=>assertPortablePaths(['docs/A/one.md','docs/a/two.md']),/case|casing/i);
  assert.doesNotThrow(()=>assertPortablePaths(['docs/A/one.md','docs/A/two.md']));
});

test('publication refuses a linked root directory',t=>{
  const root=fixture(t),container=fs.mkdtempSync(path.join(temporaryRoot,'huoda-root-link-'));
  t.after(()=>{assert.ok(container.startsWith(temporaryRoot+path.sep));fs.rmSync(container,{recursive:true,force:true});});
  const alias=path.join(container,'entry');
  fs.symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>checkPublication(alias),/link/i);
});

test('publication check refuses source directory links escaping the source tree',t=>{
  const root=fixture(t),outside=fs.mkdtempSync(path.join(temporaryRoot,'huoda-outside-'));
  t.after(()=>{assert.ok(outside.startsWith(temporaryRoot+path.sep));fs.rmSync(outside,{recursive:true,force:true});});
  fs.writeFileSync(path.join(outside,'other.js'),'external data');
  fs.symlinkSync(outside,path.join(root,'src'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>checkPublication(root),/link|outside|boundary/i);
  assert.ok(root.startsWith(temporaryRoot+path.sep));
  fs.rmSync(root,{recursive:true,force:true});
  assert.equal(fs.readFileSync(path.join(outside,'other.js'),'utf8'),'external data');
});
