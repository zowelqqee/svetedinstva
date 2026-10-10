import config from '../lib/config.js';
import {createBlobStorage} from '../lib/analytics.js';
import {handleRequest} from '../lib/handler.js';
const storage = createBlobStorage();
export default async function handler(req,res) {
  const scheme = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const url = new URL(req.url,`${scheme}://${req.headers.host}`);
  if (typeof req.query?.action === 'string') url.searchParams.set('action',req.query.action);
  const init = {method:req.method,headers:req.headers};
  if (!['GET','HEAD'].includes(req.method)) {
    init.body = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body ?? {});
  }
  const response = await handleRequest(new Request(url,init),{config,storage});
  res.statusCode=response.status;
  for (const [name,value] of response.headers) res.setHeader(name,value);
  res.end(Buffer.from(await response.arrayBuffer()));
}
