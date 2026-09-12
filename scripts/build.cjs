const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist');
const allowDemo=process.argv.includes('--allow-local-demo');
const url=(process.env.HUODA_SUPABASE_URL||'').trim();
const key=(process.env.HUODA_SUPABASE_PUBLISHABLE_KEY||process.env.HUODA_SUPABASE_ANON_KEY||'').trim();
const city=(process.env.HUODA_CITY||'广州').trim()||'广州';
const lat=Number(process.env.HUODA_DEFAULT_LAT||23.1291);
const lng=Number(process.env.HUODA_DEFAULT_LNG||113.2644);

function fail(message){console.error(`Build stopped: ${message}`);process.exit(1);}
function jwtRole(value){
  const parts=value.split('.');
  if(parts.length!==3)return '';
  try{return JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64url').toString('utf8')).role||'';}catch{return '';}
}

fs.rmSync(output,{recursive:true,force:true});
if(Boolean(url)!==Boolean(key))fail('HUODA_SUPABASE_URL and the publishable/anon key must be provided together.');
if(!url&&!allowDemo)fail('production requires HUODA_SUPABASE_URL and HUODA_SUPABASE_PUBLISHABLE_KEY. Use npm run build:demo only for local review.');
if(url){
  let parsed;try{parsed=new URL(url);}catch{fail('HUODA_SUPABASE_URL must be a valid HTTPS URL.');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)fail('HUODA_SUPABASE_URL must be a clean HTTPS URL without credentials, query or hash.');
  if(/[\r\n]/.test(key))fail('the Supabase public key contains an invalid newline.');
  if(/service[_-]?role|sb_secret_/i.test(key)||jwtRole(key)==='service_role')fail('a Service Role or secret key must never be placed in the browser build.');
  if(key.length<20)fail('the Supabase publishable/anon key does not look complete.');
}
if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng < -180||lng > 180)fail('default coordinates are invalid.');

const files=[
  'index.html','app.js','style.css','responsive.css','status.css',
  'THIRD_PARTY_NOTICES.md','vendor/supabase-2.57.4.js','vendor/SUPABASE-LICENSE.txt','vendor/DEPENDENCY_LICENSES.txt',
  'admin/index.html','admin/adminService.js','admin/admin.js',
  'src/core/services.js','src/core/sync.js','src/core/bootstrap.js',
  'src/services/locationService.js','src/services/recommendationService.js','src/services/taskService.js',
  'src/services/applicationService.js','src/services/favoriteService.js','src/services/messageService.js',
  'src/services/inboxService.js','src/services/notificationService.js','src/services/reviewService.js',
  'src/services/merchantService.js','src/services/authService.js','src/services/accountService.js','src/services/reportService.js',
  'src/pages/community.js','src/pages/messages.js','src/pages/chatHistory.js','src/pages/responsive.js'
];

for(const relative of files){
  const source=path.join(root,...relative.split('/'));
  if(!fs.existsSync(source))fail(`required runtime file is missing: ${relative}`);
  const target=path.join(output,...relative.split('/'));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}

const config={
  SUPABASE_URL:url,
  SUPABASE_KEY:key,
  ENVIRONMENT:url?'production':'local-demo',
  ALLOW_LOCAL_DEMO:!url&&allowDemo,
  CITY:city,
  DEFAULT_LAT:lat,
  DEFAULT_LNG:lng
};
fs.writeFileSync(path.join(output,'config.js'),`window.HUODA_CONFIG = ${JSON.stringify(config,null,2)};\n`,'utf8');
console.log(`Built ${files.length+1} public files in dist (${url?'production cloud':'local demo'}).`);
