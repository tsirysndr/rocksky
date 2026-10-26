import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Secp256k1Keypair} from '@atproto/crypto';
import {createServiceJwt} from '@atproto/xrpc-server';
import {verify_with_key} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/host_ffi.mjs';

test('AT Protocol JWT binding verifies signatures and expiry while preserving optional audience semantics',async()=>{
 const keypair=await Secp256k1Keypair.create();
 const other=await Secp256k1Keypair.create();
 const create=extra=>createServiceJwt({iss:'did:plc:test',aud:'did:web:another.example',lxm:'app.rocksky.feed.getFeedSkeleton',keypair,...extra});
 const valid=await create({});const issuers=[];
 assert.equal(await verify_with_key(valid,async did=>{issuers.push(did);return keypair.did();}),true);
 assert.deepEqual(issuers,['did:plc:test']);
 assert.equal(await verify_with_key(valid,async()=>other.did()),false);
 assert.equal(await verify_with_key(await create({exp:1,iat:0}),async()=>keypair.did()),false);
 assert.equal(await verify_with_key('invalid',async()=>{throw new Error('must not resolve malformed JWT');}),false);
});
