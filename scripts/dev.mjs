import http from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {build} from './build.mjs';
import config from '../lib/config.js';
import {handleRequest,actions} from '../lib/handler.js';
import {moscowDay} from '../lib/analytics.js';
await build();
await mkdir('.local',{recursive:true});
let secret=process.env.REPORT_PASSWORD;
if (!secret) {
  try {secret=(await readFile('.local/report-password.txt','utf8')).trim();}
  catch {secret=randomBytes(24).toString('hex');await writeFile('.local/report-password.txt',secret,{mode:0o600});}
}
const events=[];
const storage={configured:true,async record(type){events.push({type,date:moscowDay()});},async report(){
  const days=new Map([[moscowDay(),{date:moscowDay(),visits:0,downloads:0}]]);
  for(const event of events){const row=days.get(event.date)||{date:event.date,visits:0,downloads:0};row[event.type==='visit'?'visits':'downloads']++;days.set(event.date,row);}
  return [...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
}};
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.pdf':'application/pdf','.zip':'application/zip','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(actions[url.pathname]||url.pathname==='/api/router'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const init={method:req.method,headers:req.headers};
      if(!['GET','HEAD'].includes(req.method))init.body=Buffer.concat(chunks);
      const response=await handleRequest(new Request(url,init),{config,storage,secret});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    let file=decodeURIComponent(url.pathname);
    if(file==='/')file='/index.html';else if(file==='/stats')file='/stats.html';
    const target=path.resolve('dist','.'+file),root=path.resolve('dist')+path.sep;
    if(!target.startsWith(root)){res.writeHead(403);res.end();return;}
    try {const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',...(file.startsWith('/materials/')?{'Content-Disposition':'attachment'}:{})});res.end(req.method==='HEAD'?null:data);}
    catch {res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile('dist/404.html'));}
  } catch {res.writeHead(500);res.end('Preview error');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173\nLocal statistics reset after restart; access key: .local/report-password.txt'));
