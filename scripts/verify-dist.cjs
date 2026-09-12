const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const required=['index.html','config.js','app.js','style.css','responsive.css','status.css','THIRD_PARTY_NOTICES.md','admin/index.html','admin/adminService.js','admin/admin.js','vendor/supabase-2.57.4.js','src/core/bootstrap.js','src/services/accountService.js','src/services/reportService.js'];
const forbidden=['supabase.sql','tests','scripts','node_modules','.git','.env','package.json','supabase/functions'];
const failures=[];

if(!fs.existsSync(dist))failures.push('dist does not exist; run npm run build or npm run build:demo first.');
for(const file of required)if(!fs.existsSync(path.join(dist,...file.split('/'))))failures.push(`missing ${file}`);
for(const file of forbidden)if(fs.existsSync(path.join(dist,...file.split('/'))))failures.push(`forbidden artifact published: ${file}`);

function walk(dir,prefix=''){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const relative=prefix?`${prefix}/${entry.name}`:entry.name;
    return entry.isDirectory()?walk(path.join(dir,entry.name),relative):[relative];
  });
}
function exact(relative){
  let current=dist;
  for(const segment of relative.split('/')){
    if(!fs.existsSync(current))return false;
    const match=fs.readdirSync(current).find(name=>name===segment);
    if(!match)return false;
    current=path.join(current,match);
  }
  return true;
}

for(const htmlFile of ['index.html','admin/index.html']){
  const full=path.join(dist,...htmlFile.split('/'));if(!fs.existsSync(full))continue;
  const base=path.posix.dirname(htmlFile);
  const html=fs.readFileSync(full,'utf8');
  for(const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)){
    const relative=path.posix.normalize(path.posix.join(base,match[1]));
    if(relative.startsWith('../')){failures.push(`${htmlFile} escapes dist: ${match[1]}`);continue;}
    if(!exact(relative))failures.push(`${htmlFile} resource is missing or has wrong case: ${match[1]}`);
  }
}

const text=walk(dist).filter(file=>/\.(?:html|js|css|txt)$/i.test(file)).map(file=>fs.readFileSync(path.join(dist,...file.split('/')),'utf8')).join('\n');
for(const pattern of [/sb_secret_[A-Za-z0-9_-]{8,}/i,/service[_-]?role\s*[:=][^\n]{8,}/i,/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/])if(pattern.test(text))failures.push(`secret-like content matched ${pattern}`);

if(failures.length){console.error(failures.map(x=>`- ${x}`).join('\n'));process.exit(1);}
console.log(`Verified dist: ${walk(dist).length} files, resource paths and public-artifact boundary passed.`);
