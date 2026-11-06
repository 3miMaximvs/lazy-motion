import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2);
const port=Number(args[args.indexOf('--port')+1])||4173;
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2'};
const handler=async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  } catch {res.writeHead(404).end('Not found');}
};
// Keep the preview private to this computer and support both localhost resolutions.
for(const host of ['127.0.0.1','::1']) {
  http.createServer(handler).on('error',error=>{console.error(`${host}: ${error.message}`);process.exitCode=1;})
    .listen(port,host,()=>console.log(`Aperçu local : http://${host==='::1'?'[::1]':host}:${port}/?preview`));
}
