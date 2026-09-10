const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','vendor','.git','.local','test-results'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|cjs)$/.test(f)){cp.execFileSync(process.execPath,['--check',f],{stdio:'inherit'});count++;}}}
walk(root);console.log(`Syntax: ${count} JavaScript files passed`);
