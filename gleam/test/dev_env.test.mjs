import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPrivateKey} from 'node:crypto';
import dotenv from 'dotenv';
import {generate} from '../scripts/generate_dev_env.mjs';

test('Local env generation follows Compose ports without rotating secrets or losing existing credentials',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rocksky-env-'));
 const file=path.join(dir,'.env');
 const config={services:{
  db:{ports:[{target:5432,published:'15433'}],environment:{POSTGRES_USER:'local user',POSTGRES_PASSWORD:'pass@word',POSTGRES_DB:'local db'}},
  nats:{ports:[{target:4222,published:'14224'}]},
  dragonfly:{ports:[{target:6379,published:'16379'}]},
  typesense:{ports:[{target:8108,published:'18109'}],command:['--api-key=local-key']},
 }};
 try {
  fs.writeFileSync(file,"SPOTIFY_CLIENT_SECRET='keep me'\nCUSTOM_SETTING='line one\nline two'\n");
  assert.equal(generate(config,file),true);
  const first=dotenv.parse(fs.readFileSync(file));
  assert.equal(first.SPOTIFY_CLIENT_SECRET,'keep me');assert.equal(first.CUSTOM_SETTING,'line one\nline two');
  assert.equal(first.XATA_POSTGRES_URL,'postgresql://local%20user:pass%40word@127.0.0.1:15433/local%20db');
  assert.equal(first.XATA_WRITE_POSTGRES_URL,first.XATA_POSTGRES_URL);assert.equal(first.XATA_READ_POSTGRES_URL,first.XATA_POSTGRES_URL);
  assert.equal(first.NATS_URL,'nats://127.0.0.1:14224');assert.equal(first.TYPESENSE_PORT,'18109');
  assert.equal(first.SPOTIFY_ENCRYPTION_KEY.length,64);assert.equal(first.SPOTIFY_ENCRYPTION_IV.length,32);
  assert.equal(createPrivateKey(first.PRIVATE_KEY_1).asymmetricKeyType,'ec');
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.equal(generate(config,file),false);
  const backups=fs.readdirSync(dir).filter(name=>name.endsWith('.bak'));assert.equal(backups.length,1);
  assert.match(fs.readFileSync(path.join(dir,backups[0]),'utf8'),/keep me/);
  config.services.nats.ports[0].published='24224';assert.equal(generate(config,file),true);
  const second=dotenv.parse(fs.readFileSync(file));assert.deepEqual(second,{...first,NATS_URL:'nats://127.0.0.1:24224'});
  const beforeForce=fs.readFileSync(file,'utf8');
  assert.equal(generate(config,file,{force:true}),true);
  const forced=dotenv.parse(fs.readFileSync(file));
  assert.equal(forced.SPOTIFY_CLIENT_SECRET,'');
  assert.equal(forced.CUSTOM_SETTING,undefined);
  for(const key of ['COOKIE_SECRET','JWT_SECRET','STORAGE_ENCRYPTION_KEY','SPOTIFY_ENCRYPTION_KEY','SUBMISSIONS_SECRET','SPOTIFY_ENCRYPTION_IV','PRIVATE_KEY_1','PRIVATE_KEY_2','PRIVATE_KEY_3']) {
   assert.notEqual(forced[key],second[key]);
  }
  assert.equal(forced.NATS_URL,second.NATS_URL);
  assert.equal(createPrivateKey(forced.PRIVATE_KEY_1).asymmetricKeyType,'ec');
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.ok(fs.readdirSync(dir).filter(name=>name.endsWith('.bak')).some(name=>fs.readFileSync(path.join(dir,name),'utf8')===beforeForce));
  assert.equal(generate(config,file),false);
  const content=fs.readFileSync(file,'utf8');delete config.services.db.ports;
  assert.throws(()=>generate(config,file),/publish TCP port 5432/);assert.equal(fs.readFileSync(file,'utf8'),content);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
