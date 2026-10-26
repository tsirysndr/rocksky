import {createServer} from 'node:http';
import {spawn as spawnProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {Ok,Error as GleamError} from '../../gleam_stdlib/gleam.mjs';
export const oauth_listener = (port,callback) => new Promise(resolve=>{
 const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','https://rocksky.app');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST'||req.url!=='/token'){res.writeHead(404);res.end();return;}
  try {
   let body=''; for await(const chunk of req){body+=chunk;if(body.length>65536)throw new Error('Request too large');}
   const data=JSON.parse(body);
   if(typeof data.token!=='string'||!data.token)throw new Error('Missing token');
   const saved=callback(data);if(!(saved instanceof Ok))throw new Error(saved[0]);
   res.setHeader('Content-Type','application/json');res.end('{"ok":1}');server.close();
  } catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
 });
 server.once('error',e=>resolve(new GleamError(e.message)));
 server.listen(port,'127.0.0.1',()=>resolve(new Ok(server)));
});
export const close_server=server=>{server.close();};
export const mcp_binary=async()=>{
 const override=process.env.ROCKSKY_MCP_BIN?.trim();if(override)return override;
 try {return await createRequire(import.meta.url)('@rocksky/mcp').ensureBinary();}
 catch(e){process.stderr.write(`rocksky: ${String(e.message).split('\n')[0]}; falling back to rocksky-mcp on PATH\n`);return 'rocksky-mcp';}
};
export const spawn=(binary,args)=>{
 const child=spawnProcess(binary,Array.from(args),{stdio:'inherit'});
 const handlers=['SIGINT','SIGTERM','SIGHUP'].map(signal=>{const fn=()=>child.kill(signal);process.on(signal,fn);return [signal,fn];});
 const clean=()=>{for(const [signal,fn] of handlers)process.off(signal,fn);};
 child.on('error',error=>{clean();console.error(`rocksky: failed to start ${binary}: ${error.message}`);process.exitCode=1;});
 child.on('exit',(code,signal)=>{clean();if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
};
export const upload=async(url,token,file,mime,storage,progress)=>{
 try {
  const [{default:axios},{default:FormData}]=await Promise.all([import('axios'),import('form-data')]);
  const size=fs.statSync(file).size,form=new FormData();
  form.append('file',fs.createReadStream(file),{filename:path.basename(file),contentType:mime,knownLength:size});
  if(storage)form.append('storage_provider_id',storage);
  const response=await axios.post(url,form,{headers:{...form.getHeaders(),Authorization:`Bearer ${token}`},maxBodyLength:Infinity,maxContentLength:Infinity,onUploadProgress:e=>progress(Math.min(100,Math.round(e.loaded*100/(e.total||size))))});
  return new Ok(response.data);
 }catch(e){return new GleamError(`${e.response?.status??''} ${e.response?.data?.message??e.message}`);}
};
