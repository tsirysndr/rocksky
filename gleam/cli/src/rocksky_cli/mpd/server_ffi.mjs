import net from 'node:net';
import {Ok,Error as GleamError} from '../../../gleam_stdlib/gleam.mjs';
import {tokenize} from './protocol.mjs';
export const serve=(bind,port,greeting,connection,cleanup,cover)=>new Promise((resolve,reject)=>{
 const sockets=new Set();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.setEncoding('utf8');socket.write(greeting);const handle=connection();let buffer='',pending=Promise.resolve(),binaryLimit=8192;
  const handleLine=async line=>{
   const [name,...args]=Array.from(tokenize(line));
   if(name==='binarylimit'){const n=Number(args[0]);if(!Number.isInteger(n)||n<1||n>65536)return 'ACK [2@0] {binarylimit} Expected 1..65536 bytes\n';binaryLimit=n;return 'OK\n';}
   if(name==='albumart'||name==='readpicture'){
    const offset=Number(args[1]??0);if(!Number.isInteger(offset)||offset<0)return `ACK [2@0] {${name}} Invalid offset\n`;
    const result=await cover(args[0]??'');if(!(result instanceof Ok))return `ACK [50@0] {${name}} ${String(result[0]).replace(/[\r\n]/g,' ')}\n`;
    const {bytes,type}=result[0];if(offset>bytes.length)return `ACK [2@0] {${name}} Offset exceeds image size\n`;
    const chunk=bytes.subarray(offset,offset+binaryLimit);return Buffer.concat([Buffer.from(`size: ${bytes.length}\n${name==='readpicture'?`type: ${type}\n`:''}binary: ${chunk.length}\n`),chunk,Buffer.from('\nOK\n')]);
   }
   return handle(line);
  };
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>1024*1024){socket.destroy();return;}let i;while((i=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);pending=pending.then(async()=>{const output=await handleLine(line);if(!socket.destroyed)socket.write(output);if(line==='close')socket.end();}).catch(error=>{if(!socket.destroyed)socket.write(`ACK [52@0] {} ${String(error.message).replace(/[\r\n]/g,' ')}\n`);});}});
  const timer=setInterval(()=>{pending=pending.then(async()=>{const output=await handle('__poll__');if(output&&!socket.destroyed)socket.write(output);}).catch(()=>{});},500);
  socket.on('error',()=>{});socket.on('close',()=>{clearInterval(timer);sockets.delete(socket);});
 });
 let attempt=port;
 server.on('error',e=>{if(e.code==='EADDRINUSE'&&attempt<port+20)server.listen(++attempt,bind);else reject(e);});
 server.on('listening',()=>resolve([server.address().port,close]));
 let closed=false;const close=()=>{if(closed)return;closed=true;process.off('SIGINT',close);process.off('SIGTERM',close);cleanup();for(const socket of sockets)socket.destroy();server.close();};
 process.once('SIGINT',close);process.once('SIGTERM',close);server.listen(attempt,bind);
});

const covers=new Map();
export const fetch_cover=async url=>{
 if(covers.has(url))return new Ok(covers.get(url));
 try{const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Cover HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>16*1024*1024)throw new Error('Cover exceeds 16 MiB');
 const value={bytes,type:(response.headers.get('content-type')||'image/jpeg').split(';')[0].replace(/[\r\n]/g,'')};if(covers.size>=32)covers.delete(covers.keys().next().value);covers.set(url,value);return new Ok(value);
 }catch(e){return new GleamError(e.message);}
};
