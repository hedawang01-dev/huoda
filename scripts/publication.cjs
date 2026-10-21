const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');

const LICENSE_ID='PolyForm-Noncommercial-1.0.0';
const LICENSE_SHA256='ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8';
const rootFiles=new Set(['.env.example','.gitattributes','.gitignore','.nvmrc','LICENSE','README.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','OPEN_SOURCE_READINESS_REPORT.md','BRAND.md','MIGRATION.md','TESTING.md','package.json','package-lock.json','index.html','app.js','style.css','responsive.css','status.css','supabase.sql','config.example.js','vercel.json','启动活搭.cmd']);
const rootDirectories=new Set(['.github','admin','src','supabase','scripts','tests','vendor','docs']);
const excludedDirectories=new Set(['.git','node_modules','.local','dist','test-results','.vercel','.supabase','.idea','.vscode','.cache','coverage']);
const requiredFiles=['LICENSE','README.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','index.html','app.js','supabase.sql','config.example.js','vendor/SUPABASE-LICENSE.txt','vendor/DEPENDENCY_LICENSES.txt','vendor/supabase-2.57.4.js'];
const patterns=[
  ['provider credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sb_secret_[A-Za-z0-9_-]{16,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,})\b/],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential-bearing connection URL',/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^/\s"'<>]+:[^@\s"'<>]+@/i],
  ['JWT requiring private review',/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/],
  ['personal Windows user path',/\b[A-Za-z]:[\\/]+Users[\\/]+[^\r\n\\/"<>]+[\\/]+/i]
];
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function excludedFile(relative){
  const name=path.posix.basename(relative).toLowerCase();
  return relative==='config.js'||(name.startsWith('.env')&&name!=='.env.example')||
    ['.npmrc','.pypirc','.netrc','.git-credentials','id_rsa','id_ed25519','credentials.json'].includes(name)||
    /\.(?:db|sqlite3?)(?:-.+)?$|\.(?:log|tmp|bak|key|pem|p12|pfx|crt|cer)$|~$/i.test(name);
}
function within(root,file){const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function sourceRoot(directory){
  const requested=path.resolve(directory);
  if(fs.lstatSync(requested).isSymbolicLink())throw new Error('Publication refuses a linked source root.');
  return fs.realpathSync(requested);
}
function assertPortablePaths(paths){
  const seen=new Map();
  for(const relative of paths){
    const segments=relative.split('/');
    for(let count=1;count<=segments.length;count++){
      const spelling=segments.slice(0,count).join('/'),folded=spelling.toLowerCase();
      if(seen.has(folded)&&seen.get(folded)!==spelling)throw new Error('Case-colliding publication path: '+spelling);
      seen.set(folded,spelling);
    }
  }
}
function assertOutputAncestors(destination){
  let current=path.dirname(destination);
  const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
  for(;;){
    let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(stat){
      if(stat.isSymbolicLink())throw new Error('Publication refuses a linked output ancestor.');
      if(!stat.isDirectory()||normalize(fs.realpathSync(current))!==normalize(path.resolve(current)))throw new Error('Publication output ancestor boundary is unsafe.');
    }
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
}
function collect(root){
  const files=[];
  function visit(relative){
    const file=path.join(root,...relative.split('/'));
    const stat=fs.lstatSync(file);
    if(stat.isSymbolicLink())throw new Error('Publication refuses a link: '+relative);
    if(!within(root,fs.realpathSync(file)))throw new Error('Publication boundary escaped: '+relative);
    if(stat.isDirectory()){
      if(relative==='supabase/.temp'||excludedDirectories.has(path.basename(file)))return;
      for(const name of fs.readdirSync(file).sort())visit(relative+'/'+name);
    }else if(stat.isFile()&&!excludedFile(relative))files.push(relative);
  }
  for(const name of fs.readdirSync(root).sort()){
    if(rootFiles.has(name)||rootDirectories.has(name))visit(name);
  }
  return files.sort();
}
function checkPublication(directory){
  const root=sourceRoot(directory);
  const paths=collect(root);
  for(const required of requiredFiles)if(!paths.includes(required))throw new Error('Missing publication file: '+required);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')).packages?.[''];
  if(pkg.license!==LICENSE_ID||lock?.license!==LICENSE_ID)throw new Error('Publication license metadata mismatch.');
  for(const key of ['name','version','dependencies','devDependencies','engines']){
    if(!isDeepStrictEqual(pkg[key],lock?.[key]))throw new Error('Publication package/lock metadata mismatch: '+key);
  }
  const canonicalLicense=fs.readFileSync(path.join(root,'LICENSE'),'utf8').replace(/\r\n/g,'\n');
  if(sha256(Buffer.from(canonicalLicense))!==LICENSE_SHA256)throw new Error('Publication LICENSE differs from the official standard text.');
  assertPortablePaths(paths);
  const files=paths.map(relative=>{
    const bytes=fs.readFileSync(path.join(root,...relative.split('/')));
    if(/\.(?:js|cjs|ts|sql|json|md|ya?ml|html|css|txt|toml|cmd|example)$/.test(relative)||['LICENSE','.gitignore','.nvmrc'].includes(relative)){
      const content=bytes.toString('utf8');
      for(const [type,pattern] of patterns){
        const match=pattern.exec(content);
        if(match){const line=content.slice(0,match.index).split('\n').length;throw new Error('Publication review required: '+type+' at '+relative+':'+line+' (value withheld)');}
      }
    }
    return {path:relative,bytes:bytes.length,sha256:sha256(bytes)};
  });
  return {files,license:LICENSE_ID,classification:'noncommercial source-available',technicalChecks:'passed',credentialScan:'limited heuristic patterns; manual review remains necessary',publicationPerformed:false};
}
function packPublication(directory,output){
  const root=sourceRoot(directory);
  const destination=path.resolve(output);
  try{fs.lstatSync(destination);throw new Error('Publication output already exists; choose a new --output directory.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(within(root,destination)&&path.relative(root,destination).split(path.sep)[0]!=='.local')throw new Error('Publication output inside the source must be under .local.');
  assertOutputAncestors(destination);
  const result=checkPublication(root);
  const sourceDirectory=path.join(destination,'source');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  assertOutputAncestors(destination);
  fs.mkdirSync(destination);
  fs.mkdirSync(sourceDirectory);
  for(const item of result.files){
    const source=path.join(root,...item.path.split('/'));
    if(fs.lstatSync(source).isSymbolicLink()||!within(root,fs.realpathSync(source)))throw new Error('Publication source boundary changed: '+item.path);
    const target=path.join(sourceDirectory,...item.path.split('/'));
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    if(sha256(fs.readFileSync(target))!==item.sha256)throw new Error('Publication source changed during copy: '+item.path);
  }
  const manifestPath=path.join(destination,'MANIFEST.json');
  fs.writeFileSync(manifestPath,JSON.stringify({...result,historyIncluded:false,files:result.files},null,2)+'\n',{flag:'wx'});
  return {...result,sourceDirectory,manifestPath};
}
if(require.main===module){
  try{
    const root=path.resolve(__dirname,'..');
    const command=process.argv[2]||'check';
    if(command==='check'){
      if(process.argv.length>3)throw new Error('check accepts no additional arguments.');
      const result=checkPublication(root);
      console.log(JSON.stringify({...result,fileCount:result.files.length,files:undefined},null,2));
    }else if(command==='pack'){
      const args=process.argv.slice(3);
      let output;
      if(args.length===0)output=path.join(root,'.local','publication-candidate');
      else if(args.length===1&&!args[0].startsWith('-'))output=args[0];
      else if(args.length===2&&args[0]==='--output'&&!args[1].startsWith('-'))output=args[1];
      else throw new Error('Use pack [directory] or pack --output directory.');
      const result=packPublication(root,output);
      console.log(JSON.stringify({technicalChecks:result.technicalChecks,fileCount:result.files.length,sourceDirectory:result.sourceDirectory,manifestPath:result.manifestPath,publicationPerformed:false,humanReview:'Read docs/PUBLICATION_CHECKLIST.md before any external publication.'},null,2));
    }else throw new Error('Use check or pack [directory].');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={checkPublication,packPublication,assertPortablePaths};
