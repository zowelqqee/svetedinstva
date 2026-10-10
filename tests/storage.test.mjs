import test from 'node:test';import assert from 'node:assert/strict';
import {createBlobStorage,moscowDay} from '../lib/analytics.js';
import {publicUrl} from '../lib/config.js';
test('Blob events are private and concurrent writes have unique keys',async()=>{
  const calls=[];
  const storage=createBlobStorage({token:'test',putBlob:async(...args)=>calls.push(args)});
  await Promise.all(Array.from({length:20},()=>storage.record('visit')));
  assert.equal(new Set(calls.map(c=>c[0])).size,20);
  assert.equal(calls[0][2].access,'private');
  assert.deepEqual(JSON.parse(calls[0][1]),{type:'visit'});
});
test('Reports page through all blobs and use Moscow calendar days',async()=>{
  const calls=[];
  const storage=createBlobStorage({token:'test',listBlobs:async(options)=>{
    calls.push(options);
    return options.cursor?{blobs:[{pathname:'metrics/2026-10-10/download/b.json'}],hasMore:false}:{blobs:[{pathname:'metrics/2026-10-10/visit/a.json'}],hasMore:true,cursor:'page2'};
  }});
  const rows=await storage.report();
  assert.deepEqual(rows.find(r=>r.date==='2026-10-10'),{date:'2026-10-10',visits:1,downloads:1});
  assert.equal(calls[1].cursor,'page2');
  assert.equal(moscowDay(new Date('2026-10-10T22:30:00Z')),'2026-10-11');
  await assert.rejects(createBlobStorage({token:''}).report(),/private Vercel Blob/);
});
test('Material paths stay inside public and support Russian filenames',()=>{
  assert.equal(publicUrl('public/materials/маска.pdf'),'/materials/%D0%BC%D0%B0%D1%81%D0%BA%D0%B0.pdf');
  assert.throws(()=>publicUrl('public/../.env.local'));
  assert.throws(()=>publicUrl('.local/password.txt'));
});
