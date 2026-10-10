import {readFile,writeFile} from 'node:fs/promises';
import {basename,extname} from 'node:path';
const config=JSON.parse(await readFile('source/config.json','utf8'));
config.maskName=config.maskPath?'maska-sobora'+extname(config.maskPath):'';
const types={'.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.pdf':'application/pdf','.zip':'application/zip'};
const assets={};
for(const [route,path] of Object.entries({'/hero.png':config.heroPath,'/year-logo.png':'assets/year-logo.png','/culture-logo.png':config.cultureLogoPath,'/golos.ttf':'assets/golos-text.ttf',...(config.maskPath?{'/mask':config.maskPath}:{}),...(config.rulesPath?{'/rules.pdf':config.rulesPath}:{})})){const data=await readFile(path);assets[route]={type:types[extname(path)]||'application/octet-stream',data:data.toString('base64')}}
const text={};for(const [route,file,type] of [['/style.css','source/style.css','text/css'],['/client.js','source/client.js','text/javascript'],['/stats.css','source/stats.css','text/css'],['/stats.js','source/stats.js','text/javascript']])text[route]={type:type+'; charset=utf-8',data:(await readFile(file,'utf8')).replace('__CONFIG__',JSON.stringify(config))};
text['/favicon.svg']={type:'image/svg+xml',data:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2134A0"/><path d="M29 10h6v13h7v26H22V23h7z" fill="white"/><path d="M19 49h26v7H19z" fill="#DE2726"/></svg>'};
const prefix=`const HTML=${JSON.stringify(await readFile('source/index.html','utf8'))};\nconst STATS_HTML=${JSON.stringify(await readFile('source/stats.html','utf8'))};\nconst CONFIG=${JSON.stringify(config)};\nconst ASSETS=${JSON.stringify(assets)};\nconst TEXT=${JSON.stringify(text)};\n`;
await writeFile('worker/index.js',prefix+await readFile('source/server.js','utf8'));console.log('Worker assembled with local assets');
