import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {toList} from '../../gleam_stdlib/gleam.mjs';
export const open=async()=>{
 const [{default:Database},{default:envPaths},{drizzle},{migrate}]=await Promise.all([import('better-sqlite3'),import('env-paths'),import('drizzle-orm/better-sqlite3'),import('drizzle-orm/better-sqlite3/migrator')]);
 const directory=process.env.ROCKSKY_CLI_DATA_DIR||envPaths('rocksky',{suffix:''}).data;fs.mkdirSync(directory,{recursive:true});
 const db=new Database(path.join(directory,'rocksky.sqlite'));
 const candidates=[new URL('../drizzle/',import.meta.url),new URL('../../../../../cli/drizzle/',import.meta.url)];
 const migrationsFolder=candidates.map(fileURLToPath).find(p=>fs.existsSync(path.join(p,'meta','_journal.json')));
 if(!migrationsFolder){db.close();throw new Error('CLI migrations are missing');}
 try{migrate(drizzle(db),{migrationsFolder});return db;}catch(e){db.close();throw e;}
};
export const query=(db,sql,values)=>toList(db.prepare(sql).all(...values));
export const run=(db,sql,values)=>{db.prepare(sql).run(...values);};
const quote=name=>{if(!/^[a-z_]+ ?$/.test(name))throw new Error('Invalid SQL identifier');return `"${name}"`;};
export const insert=(db,table,fields,conflict)=>{
 const entries=Array.from(fields),columns=entries.map(p=>p[0]);
 const update=conflict?` ON CONFLICT(${quote(conflict)}) DO UPDATE SET ${columns.filter(c=>c!==conflict&&c!=='id'&&c!=='xata_id').map(c=>`${quote(c)}=excluded.${quote(c)}`).join(',')}`:' ON CONFLICT DO NOTHING';
 return db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(()=>'?').join(',')})${update} RETURNING *`).get(...entries.map(p=>p[1]))??null;
};
export const transaction=(db,work)=>{db.transaction(work)();};
export const close=db=>{db.close();};
