import {Some} from '../../../gleam_stdlib/gleam/option.mjs';
import { Ok, Error as GError } from '../../gleam.mjs';
export const check = signal => {try {signal.throwIfAborted();return new Ok(undefined);} catch(e) {return new GError(e);} };
export const timeout=ms=>AbortSignal.timeout(ms);
export const any=signals=>AbortSignal.any(signals.toArray());
export const aborted=signal=>signal.aborted;
export const sleep=async(ms,signal)=>{try {const {setTimeout}=await import('node:timers/promises');await setTimeout(ms,undefined,{signal:signal instanceof Some?signal[0]:undefined});return new Ok(undefined);}catch(e){return new GError(e);}};
