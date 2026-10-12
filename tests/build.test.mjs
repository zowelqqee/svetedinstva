import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';
import {build} from '../scripts/build.mjs';
import handler from '../api/router.js';
test('Root build exports every browser asset without unresolved config or private credentials',async()=>{
  await build();
  const html=await readFile('dist/index.html','utf8');
  for(const file of [...html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)].map(m=>m[1]))await access('dist'+file);
  const client=await readFile('dist/client.js','utf8');
  assert.ok(!client.includes('__CONFIG__'));
  assert.ok(!client.includes('REPORT_PASSWORD'));
  assert.ok(!client.includes('BLOB_READ_WRITE_TOKEN'));
  await access('dist/stats.html');
  const vercel=JSON.parse(await readFile('vercel.json','utf8'));
  assert.equal(vercel.outputDirectory,'dist');
  for (const file of ['index.html', 'stats.html', '404.html']) {
    const page = await readFile('dist/' + file, 'utf8');
    assert.equal((page.match(/data-cf-beacon=/g) || []).length, 1, file);
    assert.match(page, /47dbbc97ac5848e88fdcc43f978a8574/);
    assert.match(page, /type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/);
  }
  const csp = vercel.headers.flatMap(block => block.headers).find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js;/);
  assert.match(csp, /connect-src 'self' https:\/\/cloudflareinsights\.com;/);
  assert.equal(vercel.rewrites.find(r=>r.source==='/download/mask').destination,'/api/router?action=download');
});
test('Vercel bridge accepts parsed JSON body and rewritten action',async()=>{
  const old=process.env.REPORT_PASSWORD;process.env.REPORT_PASSWORD='bridge-secret';
  try{
    const req={method:'POST',url:'/api/router',query:{action:'login'},headers:{host:'svet.example',origin:'https://svet.example','content-type':'application/json'},body:{password:'bridge-secret'}};
    const res={headers:{},setHeader(name,value){this.headers[name]=value;},end(body){this.body=body;}};
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.match(res.headers['set-cookie'],/HttpOnly/);
  }finally{if(old===undefined)delete process.env.REPORT_PASSWORD;else process.env.REPORT_PASSWORD=old;}
});
