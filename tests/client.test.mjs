import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function download(responses) {
  const listeners = {}, requests = [], saved = [], notices = [];
  const element = {addEventListener(){}, querySelectorAll(){return []}};
  const button = {dataset:{action:'mask'}, addEventListener(event, handler){listeners[event]=handler}};
  const source = (await readFile('src/client.js','utf8')).replace('__CONFIG__', JSON.stringify({
    maskPath:'/materials/mask.pdf', maskName:'maska-sobora.pdf'
  }));
  vm.runInNewContext(source, {
    document:{
      querySelector(){return {...element, showModal(){notices.push(true)}}},
      querySelectorAll(selector){return selector==='[data-action]'?[button]:[]},
      createElement(){return {click(){saved.push(this.download)}}}
    },
    navigator:{webdriver:true},
    fetch:async path=>{requests.push(path);return responses.shift()},
    URL:{createObjectURL(){return 'blob:mask'},revokeObjectURL(){}},
    setTimeout(){}
  });
  await listeners.click();
  return {requests, saved, notices, disabled:button.disabled};
}

test('Mask download falls back to the static PDF when hosting returns an HTML page', async()=>{
  const result=await download([
    new Response('<!doctype html><html></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}),
    new Response('%PDF-1.4\n',{headers:{'Content-Type':'application/pdf'}})
  ]);
  assert.deepEqual(result.requests,['/download/mask','/materials/mask.pdf']);
  assert.deepEqual(result.saved,['maska-sobora.pdf']);
  assert.equal(result.notices.length,0);
  assert.equal(result.disabled,false);
});

test('Mask download preserves the statistics route when it returns a PDF', async()=>{
  const result=await download([new Response('%PDF-1.4\n',{headers:{'Content-Type':'application/pdf'}})]);
  assert.deepEqual(result.requests,['/download/mask']);
  assert.deepEqual(result.saved,['maska-sobora.pdf']);
});

test('Mask download refuses to save non-PDF data under a PDF filename', async()=>{
  const result=await download([
    new Response('<html></html>',{headers:{'Content-Type':'text/html'}}),
    new Response('<html></html>',{headers:{'Content-Type':'text/html'}})
  ]);
  assert.equal(result.saved.length,0);
  assert.equal(result.notices.length,1);
  assert.equal(result.disabled,false);
});
