import {Ok,Error as GleamError,toList} from '../../gleam_stdlib/gleam.mjs';
const attempt=async work=>{try{return new Ok(await work());}catch(e){return new GleamError(e.message);}};
export const readers=()=>attempt(async()=>{const {openNfc}=await import('./hardware/nfc_ffi.mjs');const session=await openNfc();try{const readers=[];session.onReader((name,connected)=>{if(connected)readers.push(name);});await new Promise(r=>setTimeout(r,800));return toList(readers);}finally{session.close();}});
export const read_tag=(watch,callback)=>attempt(async()=>{
 const {openNfc}=await import('./hardware/nfc_ffi.mjs');const session=await openNfc();
 try{await new Promise((resolve,reject)=>{
  const timer=watch?null:setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for a tag.'));},30000);
  const stop=()=>{cleanup();resolve();};const cleanup=()=>{clearTimeout(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  session.onTag(({uid,payloads})=>{callback(uid,toList(payloads));if(!watch)stop();});
 });}finally{session.close();}
});
let shared=null,opening=null;
const connect=()=>shared?Promise.resolve(shared):(opening??=import('./hardware/nfc_ffi.mjs').then(m=>m.openNfc()).then(s=>{shared=s;return s;}).catch(e=>{opening=null;throw e;}));
export const watch=callback=>{let stopped=false,busy=false;connect().then(s=>{if(stopped){s.close();shared=null;opening=null;return;}s.onTag(async({payloads})=>{if(busy||stopped)return;busy=true;try{await callback(toList(payloads));}catch{}finally{busy=false;}});}).catch(()=>{});return ()=>{stopped=true;shared?.close();shared=null;opening=null;};};
export const write_tag=payloads=>attempt(async()=>{const existing=!!shared;const session=await connect();try{await session.write(Array.from(payloads));}finally{if(!existing){session.close();shared=null;opening=null;}}});
export const read_card=()=>attempt(async()=>{const [{openCard},{readCard}]=await Promise.all([import('./hardware/card-reader_ffi.mjs'),import('./hardware/cards_ffi.mjs')]);const session=await openCard();try{return toList(await readCard(session.transmit,session.kind));}finally{session.close();}});
export const write_card=(payloads,secret)=>attempt(async()=>{const [{openCard},{writeCard,cardSecret}]=await Promise.all([import('./hardware/card-reader_ffi.mjs'),import('./hardware/cards_ffi.mjs')]);const session=await openCard();try{return toList(await writeCard(session.transmit,session.kind,Array.from(payloads),secret||cardSecret(session.kind).fallback));}finally{session.close();}});
export const decode_component=value=>{try{return decodeURIComponent(value);}catch{return value;}};
