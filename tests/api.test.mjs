import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest,authorized,sessionCookie} from '../lib/handler.js';
const origin='https://svet.example';
const request=(path,init={})=>new Request(origin+path,init);
const post=(body,headers={})=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
function dependencies(config={}) {
  const events=[];
  return {config:{maskPath:'',...config},secret:'test-secret',storage:{configured:true,async record(type){events.push(type);},async report(){return [{date:'2026-10-10',visits:1,downloads:0}];}},events};
}
test('API requires correct methods, origin, and report access',async()=>{
  const env=dependencies();
  assert.equal((await handleRequest(request('/api/visit'),env)).status,405);
  assert.equal((await handleRequest(request('/api/visit',{method:'POST'}),env)).status,403);
  assert.equal((await handleRequest(request('/api/stats'),env)).status,401);
  assert.equal((await handleRequest(request('/api/stats/login',post({password:'wrong'})),env)).status,401);
  assert.equal((await handleRequest(request('/api/visit',post({})),env)).status,204);
  assert.deepEqual(env.events,['visit']);
  await handleRequest(request('/api/visit',post({}, {'User-Agent':'crawler'})),env);
  assert.equal(env.events.length,1);
});
test('Login gives a signed expiring session, with CSV and logout',async()=>{
  const env=dependencies();
  const login=await handleRequest(request('/api/stats/login',post({password:env.secret})),env);
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!cookie.includes(env.secret));
  const headers={Cookie:cookie.split(';')[0]};
  const res=await handleRequest(request('/api/stats',{headers}),env);
  assert.equal(res.status,200);
  assert.equal((await res.json()).timezone,'Europe/Moscow');
  const csv=await handleRequest(request('/api/stats.csv',{headers}),env);
  assert.match(await csv.text(),/2026-10-10;1;0/);
  assert.equal(authorized(request('/api/stats',{headers:{Cookie:headers.Cookie+'x'}}),env.secret),false);
  assert.equal(authorized(request('/api/stats',{headers:{Cookie:sessionCookie(env.secret,0)}}),env.secret),false);
  const logout=await handleRequest(request('/api/stats/logout',post({})),env);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('Absent secrets, oversized bodies and invalid JSON fail clearly',async()=>{
  const env=dependencies();
  assert.equal((await handleRequest(request('/api/stats/login',post({password:'x'})),{...env,secret:''})).status,503);
  assert.equal((await handleRequest(request('/api/stats/login',post({password:'x'.repeat(3000)})),env)).status,413);
  assert.equal((await handleRequest(request('/api/stats/login',{...post({}),body:'null'}),env)).status,401);
  assert.equal((await handleRequest(request('/api/stats/login',{...post({}),body:'broken'}),env)).status,400);
});
test('Download preserves file delivery while storage is absent or failing',async()=>{
  const missing=dependencies();
  assert.equal((await handleRequest(request('/download/mask'),missing)).status,404);
  assert.equal(missing.events.length,0);
  const env=dependencies({maskPath:'public/materials/maska.pdf'});
  const download=await handleRequest(request('/download/mask'),env);
  assert.equal(download.status,302);
  assert.equal(download.headers.get('location'),'/materials/maska.pdf');
  assert.deepEqual(env.events,['download']);
  await handleRequest(request('/download/mask',{method:'HEAD'}),env);
  assert.equal(env.events.length,1);
  const noStorage={...env,storage:{configured:false}};
  assert.equal((await handleRequest(request('/download/mask'),noStorage)).status,302);
  const broken={...env,storage:{configured:true,async record(){throw Error('offline');},async report(){throw Error('offline');}}};
  assert.equal((await handleRequest(request('/download/mask'),broken)).status,302);
  const cookie=sessionCookie(env.secret).split(';')[0];
  assert.equal((await handleRequest(request('/api/stats',{headers:{Cookie:cookie}}),broken)).status,503);
});
