const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicFiles=new Set(['index.html','app.js','style.css','responsive.css','status.css','config.js','vendor/supabase-2.57.4.js','admin/index.html','admin/adminService.js','admin/admin.js']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end('Method not allowed');}
    const url=new URL(req.url,'http://localhost');
    const decoded=decodeURIComponent(url.pathname);
    let relative=decoded.slice(1);
    if(!relative)relative='index.html';
    if(relative==='admin'||relative==='admin/')relative='admin/index.html';
    const source=/^src\/(core|services|pages)\/[A-Za-z][A-Za-z0-9]*\.js$/.test(relative);
    if(decoded.includes('\\')||decoded.includes('\0')||(!publicFiles.has(relative)&&!source)){
      res.writeHead(403);return res.end('Forbidden');
    }
    // Fresh source packages use the anonymous demo template until a local config exists.
    const fallback=relative==='config.js'&&!fs.existsSync(path.join(root,'config.js'));
    const file=path.resolve(root,fallback?'config.example.js':relative);
    if(!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}
    if(!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep)){res.writeHead(403);return res.end('Forbidden');}
    const stat=fs.statSync(file);
    if(!stat.isFile()){res.writeHead(404);return res.end('Not found');}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Content-Length',stat.size);
    if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.writeHead(400);res.end('Bad request');}
}
function createServer(){return http.createServer(handler);}
if(require.main===module){
  const port=Number(process.env.PORT)||8085;
  createServer().listen(port,'127.0.0.1',()=>console.log(`HUODA: http://127.0.0.1:${port}`));
}
module.exports={createServer};
