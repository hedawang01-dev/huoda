const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.resolve(__dirname,'..');
const migrationDir=path.join(root,'supabase','migrations');
const expected=[
  '202609090000_base_schema.sql',
  '202609100001_v050_foundation.sql',
  '202609100002_task_edit.sql',
  '202609100003_message_inbox.sql',
  '202609100004_desktop_sync.sql',
  '202609110005_service_hardening.sql',
  '202609120006_v054_cloud_lifecycle.sql'
];
const files=fs.readdirSync(migrationDir).filter(x=>x.endsWith('.sql')).sort();
const failures=[];
if(JSON.stringify(files)!==JSON.stringify(expected))failures.push(`migration order mismatch: ${files.join(', ')}`);

const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const rootSql=fs.readFileSync(path.join(root,'supabase.sql'),'utf8');
const baseSql=fs.readFileSync(path.join(migrationDir,expected[0]),'utf8');
if(digest(rootSql)!==digest(baseSql))failures.push('supabase.sql and the CLI base migration differ');

const tables=new Map();
const policies=new Map();
const functions=new Map();
for(const file of files){
  const sql=fs.readFileSync(path.join(migrationDir,file),'utf8');
  if(!/^\s*(?:--[^\n]*\n\s*)*begin;/i.test(sql)||!/commit;\s*$/i.test(sql))failures.push(`${file} is not wrapped in one transaction`);

  for(const match of sql.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-z0-9_]+)/gi)){
    const key=match[1].toLowerCase();
    if(tables.has(key))failures.push(`table ${key} is created in both ${tables.get(key)} and ${file}`);
    else tables.set(key,file);
  }

  for(const match of sql.matchAll(/create\s+policy\s+(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+public\.([a-z0-9_]+)/gi)){
    const name=(match[1]||match[2]).toLowerCase(),table=match[3].toLowerCase(),key=`${table}.${name}`;
    if(policies.has(key)){
      const before=sql.slice(0,match.index);
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const replacement=new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+(?:"${escaped}"|${escaped})\\s+on\\s+public\\.${table}`,'i');
      if(!replacement.test(before))failures.push(`policy ${key} is recreated in ${file} without an earlier DROP POLICY`);
    }
    policies.set(key,file);
  }

  for(const match of sql.matchAll(/create\s+(or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)){
    const replace=Boolean(match[1]),name=match[2].toLowerCase();
    if(functions.has(name)&&!replace){
      const before=sql.slice(0,match.index),escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(!(new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${escaped}\\s*\\(`,'i')).test(before))failures.push(`function ${name} is recreated in ${file} without OR REPLACE or DROP FUNCTION`);
    }
    functions.set(name,file);
  }
}

if(failures.length){console.error(failures.map(x=>`- ${x}`).join('\n'));process.exit(1);}
console.log(`Migration chain passed: ${files.length} ordered transactions, ${tables.size} tables, ${policies.size} policy names and ${functions.size} function names checked.`);
