import {parseBuffer} from 'music-metadata';
import {Ok,Error as GError} from '../../gleam.mjs';
export const parse=(bytes,mimeType)=>parseBuffer(Buffer.from(bytes.rawBuffer),{mimeType,duration:true}).then(v=>new Ok(v),e=>new GError(e));
