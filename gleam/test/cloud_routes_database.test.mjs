import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { createDecipheriv } from 'node:crypto';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import * as dropbox from '../build/dev/javascript/rocksky_api/rocksky_api/dropbox/app.mjs';
import * as google from '../build/dev/javascript/rocksky_api/rocksky_api/googledrive/app.mjs';
test('Cloud REST routes authenticate, create music folders, refresh OAuth tokens and stream downloads', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 const originalAdapter=axios.defaults.adapter,originalFetch=globalThis.fetch;
 try {
 await createTables(pool,['users','dropbox','dropbox_tokens','dropbox_accounts','google_drive','google_drive_tokens','google_drive_accounts']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:user','u.test','User','')");
 const calls=[];let dropMissing=true,googleMissing=true,googleFail=false,refresh='refresh-one',beta;
 const adapter=async config=>{
   calls.push({url:config.url,body:typeof config.data==='string'?JSON.parse(config.data):config.data});let data={files:[{id:'file'}]},headers={};
   if(config.url==='dropbox.getFiles'&&dropMissing){dropMissing=false;throw new axios.AxiosError('missing');}
   if(config.url==='googledrive.getMusicDirectory'&&googleMissing)data={files:[]};
   if(config.url==='googledrive.createMusicDirectory')googleMissing=false;
   if(googleFail)throw new axios.AxiosError('expired');
   if(config.url.endsWith('downloadFile')){data='music-bytes';headers={'content-type':'audio/flac','content-disposition':'attachment; filename=song.flac'};}
   return {data,status:200,headers,config};
 };
 const ctx={db:{pool},metrics:{request_counter:{add(){}}},env:{jwt_secret:'secret',dropbox_client_id:'drop-id',dropbox_client_secret:'drop-secret',dropbox_redirect_uri:'https://front/callback',frontend_url:'https://front',google_redirect_uri:'https://front/google',spotify_encryption_key:'12'.repeat(32),spotify_encryption_iv:'34'.repeat(16),rocksky_beta_token:'beta'},dropbox:axios.create({adapter}),googledrive:axios.create({adapter})};
 const credentials=new google.Credentials('google-id','google-secret');const apps=[dropbox.app(ctx),google.app_with_credentials(ctx,async()=>new Ok(credentials))];
 const token=jwt.sign({did:'did:plc:user'},'secret');const call=(app,path,method='GET',body)=>app.request(path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await apps[0].request('/files')).status,401);
 assert.match((await (await call(apps[0],'/login')).json()).redirectUri,/state=u/);
 const authUrl=new URL((await (await call(apps[1],'/login')).json()).authUrl);assert.equal(authUrl.searchParams.get('state'),'u');assert.equal(authUrl.searchParams.get('prompt'),'consent');
 await call(apps[0],'/files');assert.deepEqual(calls.slice(0,3).map(c=>c.url),['dropbox.getFiles','dropbox.createMusicFolder','dropbox.getFiles']);
 await call(apps[0],'/files?path=%2FMusic');assert.equal(calls.at(-1).body.path,'/Music');
 assert.equal((await call(apps[0],'/temporary-link')).status,400);
 await call(apps[1],'/files');assert.deepEqual(calls.slice(-4).map(c=>c.url),['googledrive.getMusicDirectory','googledrive.createMusicDirectory','googledrive.getMusicDirectory','googledrive.getFilesInParents']);assert.equal(calls.at(-1).body.parent_id,'file');
 googleFail=true;assert.equal((await (await call(apps[1],'/files?parent_id=p')).json()).error,'Failed to fetch files');googleFail=false;
 const downloaded=await call(apps[0],'/download?path=song');assert.equal(downloaded.headers.get('content-type'),'audio/flac');assert.equal(await downloaded.text(),'music-bytes');
 axios.defaults.adapter=async config=>({data:{refresh_token:refresh},status:200,headers:{},config});
 for(const app of apps){assert.equal((await call(app,'/oauth/callback?state=u&code=code')).status,302);}
 const ids=(await pool.query('SELECT xata_id FROM dropbox_tokens')).rows.map(x=>x.xata_id);refresh='refresh-two';for(const app of apps)await call(app,'/oauth/callback?state=u&code=code');
 assert.deepEqual((await pool.query('SELECT xata_id FROM dropbox_tokens')).rows.map(x=>x.xata_id),ids);
 for(const table of ['dropbox_tokens','google_drive_tokens']){const rows=(await pool.query('SELECT refresh_token FROM '+table)).rows;assert.equal(rows.length,1);const decipher=createDecipheriv('aes-256-ctr',Buffer.from(ctx.env.spotify_encryption_key,'hex'),Buffer.from(ctx.env.spotify_encryption_iv,'hex'));assert.equal(Buffer.concat([decipher.update(Buffer.from(rows[0].refresh_token,'hex')),decipher.final()]).toString(),'refresh-two');}
 globalThis.fetch=async(url,opts)=>{beta=JSON.parse(opts.body);return Response.json({});};
 assert.equal((await call(apps[0],'/join','POST',{email:'bad'})).status,400);assert.equal((await call(apps[1],'/join','POST',{email:'user@example.com'})).status,200);assert.equal(beta.email,'user@example.com');
 } finally {axios.defaults.adapter=originalAdapter;globalThis.fetch=originalFetch;await pool.end();}
});
