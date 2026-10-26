import {createServer} from 'node:http';
export const serve=(port,handler,cleanup)=>new Promise((resolve,reject)=>{
 const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try{
   const url=new URL(req.url,'http://localhost');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024*1024)throw new Error('Request too large');}
   const body=raw?(req.headers['content-type']?.includes('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw)):{};
   const response=await handler({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),body,authorization:req.headers.authorization??''});
   res.writeHead(response.status,{'Content-Type':response.content_type});res.end(response.body);
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });
 server.once('error',reject);server.listen(port,()=>resolve());
 const stop=()=>server.close(()=>{void cleanup();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
});
