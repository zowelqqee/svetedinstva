import {randomUUID} from 'node:crypto';
import {put, list} from '@vercel/blob';
export const moscowDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit'
}).format(date);
export function createBlobStorage({token = process.env.BLOB_READ_WRITE_TOKEN, putBlob = put, listBlobs = list} = {}) {
  function requireToken() {
    if (!token) throw new Error('Connect a private Vercel Blob store to enable statistics');
  }
  return {
    configured: Boolean(token),
    async record(type) {
      requireToken();
      if (!['visit','download'].includes(type)) throw new Error('Unknown event');
      await putBlob(`metrics/${moscowDay()}/${type}/${randomUUID()}.json`, JSON.stringify({type}), {
        token, access:'private', addRandomSuffix:false, contentType:'application/json'
      });
    },
    async report() {
      requireToken();
      const totals = new Map();
      let cursor;
      do {
        const page = await listBlobs({token, prefix:'metrics/', limit:1000, ...(cursor ? {cursor} : {})});
        for (const blob of page.blobs) {
          const match = blob.pathname.match(/^metrics\/(\d{4}-\d{2}-\d{2})\/(visit|download)\//);
          if (!match) continue;
          const row = totals.get(match[1]) || {date:match[1], visits:0, downloads:0};
          row[match[2] === 'visit' ? 'visits' : 'downloads']++;
          totals.set(match[1],row);
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while(cursor);
      if (!totals.has(moscowDay())) totals.set(moscowDay(),{date:moscowDay(), visits:0, downloads:0});
      return [...totals.values()].sort((a,b)=>b.date.localeCompare(a.date));
    }
  };
}
