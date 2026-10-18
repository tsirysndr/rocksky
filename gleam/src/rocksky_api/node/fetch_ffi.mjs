import { Ok, Error as GError } from '../../gleam.mjs';
import { Some, None } from '../../../gleam_stdlib/gleam/option.mjs';
import { Response } from './fetch.mjs';
export const query = params => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) query.set(key, String(value));
  return query.toString();
};
export const get = async (url, headers, manual) => {
  try {
    const response = await fetch(url, { headers: Object.fromEntries(headers.toArray()), redirect: manual ? 'manual' : 'follow' });
    const location = response.headers.get('location');
    const body = manual && location ? null : await response.json().catch(() => null);
    return new Ok(new Response(response.status, location ? new Some(location) : new None(), body));
  } catch (e) { return new GError(e); }
};
export const request = async (url, method, headers, body) => {
  try {
    const response = await fetch(url, {method, headers:Object.fromEntries(headers.toArray()), ...(body instanceof Some ? {body:body[0]} : {})});
    const location = response.headers.get('location');
    const data = await response.json().catch(()=>null);
    return new Ok(new Response(response.status,location ? new Some(location) : new None(),data));
  } catch(e) { return new GError(e); }
};
