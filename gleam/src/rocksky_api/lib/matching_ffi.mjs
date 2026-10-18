import {Some,None} from '../../../gleam_stdlib/gleam/option.mjs';
export const spotifyUrlId = value => {
  try {const url=new URL(value);const match=/^\/track\/([^/]+)$/.exec(url.pathname);return url.hostname==='open.spotify.com' && match ? new Some(match[1]) : new None();} catch {return new None();}
};
