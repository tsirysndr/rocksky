import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { register as dropbox } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/dropbox/get_files.mjs';
import { register as google } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/googledrive/get_files.mjs';

test('Cloud listings scope paths and file IDs to the caller and retain provider metadata', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  try {
    await createTables(pool,['users','dropbox','dropbox_directories','dropbox_paths','google_drive','google_drive_directories','google_drive_paths']);
    await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User',''),('v','did:test:v','v.test','Other','')");
    const methods=new Map();const ctx={db:{pool},read_db:{pool}};
    dropbox({method:(n,c)=>methods.set(n,c)},ctx);google({method:(n,c)=>methods.set(n,c)},ctx);
    for(const provider of ['dropbox','google_drive']){
      await pool.query(`INSERT INTO ${provider} (xata_id,user_id,${provider}_token_id) VALUES ('p','u','token'),('q','v','other')`);
      await pool.query(`INSERT INTO ${provider}_directories (xata_id,name,path,parent_id,${provider}_id,file_id,xata_version) VALUES
        ('root','Root','/',null,'p','root-id','4'),('music','Music','/Music','root','p','music-id','2'),
        ('b','B','/Music/B','music','p','b-id',null),('a','A','/Music/A','music','p','a-id',null),
        ('other','Music','/Music',null,'q','other-id',null),('secret','Secret','/Music/Secret','other','q','secret-id',null)`);
      await pool.query(`INSERT INTO ${provider}_paths (xata_id,name,${provider}_id,file_id,directory_id,track_id${provider==='dropbox'?',path':''}) VALUES
        ('f','Song','p','song-id','music','track'${provider==='dropbox'?',\'/Music/Song\'':''})`);
      const name=provider==='dropbox'?'dropbox':'googledrive';
      const call=async(params={},auth={credentials:new Credentials(new Some('did:test:u'),new None(),new None())})=>(await methods.get(`app.rocksky.${name}.getFiles`).handler({params,auth})).body;
      const result=await call();
      assert.deepEqual(result.directories.map(d=>d.name),['A','B']);assert.equal(result.files[0].name,'Song');
      assert.equal(result.directory.id,'music');assert.equal(result.parentDirectory.id,'root');
      assert.equal(result.parentDirectory.xataVersion,provider==='google_drive'?'4':undefined);
      assert.deepEqual(await call({at:'music-id'}),result);assert.deepEqual(await call({at:'/Music/'}),result);
      assert.equal((await call({at:'other-id'})).files.length,0);assert.equal((await call({},{})).directories.length,0);
      await pool.query(`DELETE FROM ${provider}_directories WHERE xata_id IN ('a','b')`);
      assert.equal((await call()).directory.id,'music');
    }
  } finally {await pool.end();}
});
