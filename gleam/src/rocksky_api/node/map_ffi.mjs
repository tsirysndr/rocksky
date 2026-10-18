import {Some,None} from '../../../gleam_stdlib/gleam/option.mjs';
export const create = () => new Map();
export const get = (map,key) => map.has(key) ? new Some(map.get(key)) : new None();
export const set = (map,key,value) => {map.set(key,value);};
export const remove = (map, key) => { map.delete(key); };
