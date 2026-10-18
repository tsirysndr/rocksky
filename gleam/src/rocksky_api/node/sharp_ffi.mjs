import sharp from 'sharp';
import {Ok,Error as GError} from '../../gleam.mjs';
import {Some,None} from '../../../gleam_stdlib/gleam/option.mjs';
import {Metadata} from './sharp.mjs';
const opt=v=>v==null?new None():new Some(v);
export const metadata=bytes=>sharp(Buffer.from(bytes.rawBuffer)).metadata().then(m=>new Ok(new Metadata(opt(m.width),opt(m.height),opt(m.format))),e=>new GError(e));
