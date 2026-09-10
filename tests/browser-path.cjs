const fs=require('node:fs'),path=require('node:path');
const cache=path.join(process.env.LOCALAPPDATA||'','ms-playwright');
const dirs=fs.existsSync(cache)?fs.readdirSync(cache).filter(x=>/^chromium-/.test(x)).sort().reverse():[];
module.exports=process.env.BROWSER_PATH||(dirs.map(d=>path.join(cache,d,'chrome-win64','chrome.exe')).find(fs.existsSync))||undefined;
