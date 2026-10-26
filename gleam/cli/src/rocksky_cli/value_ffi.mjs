export const null_value = () => null;
export const stringify = value => JSON.stringify(value);
export const is_null = value => value === null || value === undefined;
export const from_json = value => JSON.parse(value);
export const stringify_list=items=>JSON.stringify(Array.from(items));
export const to_json=value=>value??null;
import {toList} from '../../gleam_stdlib/gleam.mjs';
export const entries=value=>toList(Object.entries(value??{}));
