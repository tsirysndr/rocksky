import prompts from 'prompts';
import {Ok,Error as GError} from '../../gleam.mjs';
import {Some,None} from '../../../gleam_stdlib/gleam/option.mjs';
export const text=message=>prompts({type:'text',name:'value',message}).then(r=>new Ok(r.value==null?new None():new Some(r.value)),e=>new GError(e));
export const confirm=(message,initial)=>prompts({type:'confirm',name:'value',message,initial}).then(r=>new Ok(!!r.value),e=>new GError(e));
export const textInitial=(message,initial)=>prompts({type:'text',name:'value',message,initial:initial instanceof Some?initial[0]:undefined}).then(r=>new Ok(r.value==null?new None():new Some(r.value)),e=>new GError(e));
export const choose=(message,choices,initial)=>prompts({type:'select',name:'value',message,choices:choices.toArray().map(([title,value])=>({title,value})),initial}).then(r=>new Ok(r.value==null?new None():new Some(r.value)),e=>new GError(e));
