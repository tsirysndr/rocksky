import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Ok, Error as GleamError } from '../../gleam_stdlib/gleam.mjs';
import { toList as fromArray } from '../../gleam_stdlib/gleam.mjs';
export const print = text => console.log(text);
export const error = text => console.error(text);
export const exit_code = code => { process.exitCode = code; };
export const env = name => process.env[name] ?? '';
export const state_path = name => path.join(process.env.ROCKSKY_STATE_DIR || path.join(os.homedir(), '.rocksky'), name);
export const read = file => { try { return new Ok(fs.readFileSync(file,'utf8')); } catch(e) { return new GleamError(e.message); } };
export const write = (file,data) => { try {
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp = `${file}.${crypto.randomUUID()}.tmp`;
 try { fs.writeFileSync(temp,data,{mode:0o600}); fs.renameSync(temp,file); }
 finally { try { fs.unlinkSync(temp); } catch {} }
 return new Ok(undefined);
} catch(e) { return new GleamError(e.message); } };
export const remove = file => { try { fs.unlinkSync(file); } catch {} };
export const files = directory => fromArray(fs.readdirSync(directory).sort().map(name=>path.join(directory,name)));
export const is_directory = file => { try { return fs.statSync(file).isDirectory(); } catch { return false; } };
export const absolute = file => path.resolve(file);
export const hash = (data,algorithm) => crypto.createHash(algorithm).update(data).digest('hex');
export const timestamp = date => { const value=Math.floor(Date.parse(date)/1000); return Number.isFinite(value) ? new Ok(value) : new GleamError('Invalid date: '+date); };
export const iso_date = seconds => new Date(seconds*1000).toISOString();
export const now = () => Math.floor(Date.now()/1000);
export const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
export const encode = encodeURIComponent;
export const fetch_json = async (url,method,token,body) => {
 try {
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body}:{})});
  const text=await response.text();
  if(!response.ok) return new GleamError(`HTTP ${response.status}: ${text || response.statusText}`);
  if(!text) return new Ok(null);
  try { return new Ok(JSON.parse(text)); } catch { return new Ok(text); }
 } catch(e) { return new GleamError(e.message); }
};
export const relative_time = date => {
 const seconds=Math.round((Date.now()-Date.parse(date))/1000);
 const [n,unit]=Math.abs(seconds)<60?[seconds,'second']:Math.abs(seconds)<3600?[Math.round(seconds/60),'minute']:Math.abs(seconds)<86400?[Math.round(seconds/3600),'hour']:[Math.round(seconds/86400),'day'];
 return new Intl.RelativeTimeFormat('en',{numeric:'auto'}).format(-n,unit);
};
export const open_browser = async url => { await (await import('open')).default(url); };
export const error_text = error => error?.message ?? String(error);
export const normalize = value => value.normalize('NFC');
export const random_hex=bytes=>crypto.randomBytes(bytes).toString('hex');
export const terminate=code=>process.exit(code);
export const shuffled=items=>{const a=Array.from(items);for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return fromArray(a);};
