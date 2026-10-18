import {Ok, Error as GError} from '../../gleam.mjs';
let loaded;
export const load=()=>loaded??=(import('@rocksky/analysis').then(m=>new Ok(m),e=>new GError(e)));
export const analyze=async(module,bytes,extension)=>{try{return new Ok(await module.analyze(Buffer.from(bytes.rawBuffer),extension));}catch(e){return new GError(e);}};
export const analyzeBatch=async(module,items,progress)=>{try{return new Ok(await module.analyzeBatch(items.toArray().map(i=>({id:i.id,buffer:Buffer.from(i.bytes.rawBuffer),extensionHint:i.extension||undefined})),progress));}catch(e){return new GError(e);}};
