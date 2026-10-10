import {createHmac, timingSafeEqual} from 'node:crypto';
import {publicUrl} from './config.js';
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {
  status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}
});
const signature = (value, secret) => createHmac('sha256',secret).update(value).digest('base64url');
export function sessionCookie(secret, now=Date.now()) {
  const expires = String(Math.floor(now/1000)+3600);
  return `svet_report=${expires}.${signature(expires,secret)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`;
}
export function authorized(request, secret, now=Date.now()) {
  if (!secret) return false;
  const cookie = (request.headers.get('cookie') || '').split(';').map(c=>c.trim()).find(c=>c.startsWith('svet_report='));
  if (!cookie) return false;
  const [expires, signed] = cookie.slice('svet_report='.length).split('.');
  if (!/^\d+$/.test(expires) || Number(expires) <= Math.floor(now/1000) || !signed) return false;
  const expected = Buffer.from(signature(expires,secret)), supplied = Buffer.from(signed);
  return expected.length === supplied.length && timingSafeEqual(expected,supplied);
}
function matchesSecret(supplied, expected) {
  if (typeof supplied !== 'string' || !expected) return false;
  const a=Buffer.from(supplied), b=Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
}
export const actions = {
  '/api/visit':'visit','/api/stats':'stats','/api/stats.csv':'csv',
  '/api/stats/login':'login','/api/stats/logout':'logout','/download/mask':'download'
};
export async function handleRequest(request, {config, storage, secret = process.env.REPORT_PASSWORD}) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || actions[url.pathname];
  if (!['visit','stats','csv','login','logout','download'].includes(action)) return json({error:'Not found'},404);
  const methods = ['visit','login','logout'].includes(action) ? ['POST'] : ['GET','HEAD'];
  if (!methods.includes(request.method)) return json({error:'Method not allowed'},405,{Allow:methods.join(', ')});
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return json({error:'Forbidden'},403);
  try {
    if (action === 'visit') {
      if (!/bot|crawler|spider/i.test(request.headers.get('user-agent') || '')) await storage.record('visit');
      return new Response(null,{status:204, headers:{'Cache-Control':'no-store'}});
    }
    if (action === 'login') {
      if (!secret) return json({error:'REPORT_PASSWORD не задан в настройках проекта'},503);
      if (Number(request.headers.get('content-length')) > 2048) return json({error:'Too large'},413);
      const body = await request.text();
      if (Buffer.byteLength(body) > 2048) return json({error:'Too large'},413);
      let data;
      try { data=JSON.parse(body); } catch { return json({error:'Bad request'},400); }
      if (!matchesSecret(data?.password,secret)) return json({error:'Неверный ключ доступа'},401);
      return json({},200,{'Set-Cookie':sessionCookie(secret)});
    }
    if (action === 'logout') return json({},200,{'Set-Cookie':'svet_report=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
    if (action === 'download') {
      if (!config.maskPath) return json({error:'Маска ещё не загружена'},404);
      // File delivery still works before storage is connected, and during a storage outage.
      if (request.method === 'GET' && storage.configured) {
        try { await storage.record('download'); } catch { console.warn('Download statistics unavailable'); }
      }
      return new Response(null,{status:302,headers:{Location:publicUrl(config.maskPath),'Cache-Control':'no-store'}});
    }
    if (!authorized(request,secret)) return json({error:'Требуется вход'},401);
    const rows = await storage.report();
    if (action === 'csv') return new Response(request.method==='HEAD'?null:'\ufeffДата;Посещения;Выдачи маски\n'+rows.map(r=>`${r.date};${r.visits};${r.downloads}`).join('\n'), {
      headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="svet-statistics.csv"','Cache-Control':'no-store'}
    });
    return request.method==='HEAD' ? new Response(null,{headers:{'Cache-Control':'no-store'}}) : json({timezone:'Europe/Moscow',rows});
  } catch {
    return json({error:'Статистика временно недоступна. Проверьте подключение Vercel Blob.'},503);
  }
}
