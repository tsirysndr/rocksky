import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {parse} from '../build/dev/javascript/rocksky_api/rocksky_api/auth/jwks.mjs';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/bsky/app.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const key={...publicKey.export({format:'jwk'}),kid:'configured-key',use:'sig',alg:'ES256'};
test('JWKS endpoint serves configured public keys without hardcoded IDs',async()=>{
 const server=app({env:{jwks_json:JSON.stringify({keys:[key]})}});
 const response=await server.request('/jwks.json');
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{keys:[key]});
});
test('JWKS parsing rejects malformed, duplicate and private keys without leaking input',()=>{
 for(const input of ['bad JSON','{}',JSON.stringify({keys:[key,key]}),JSON.stringify({keys:[{...key,x:'invalid'}]}),JSON.stringify({keys:[{...privateKey.export({format:'jwk'}),kid:'private'}]}),JSON.stringify({keys:[{kid:'symmetric',kty:'oct',k:'secret'}]})]) {
  assert.throws(()=>parse(input),{message:'JWKS_JSON must contain a valid public JWK set with unique key IDs and no private key material'});
 }
 assert.deepEqual(parse('{"keys":[]}'),{keys:[]});
});
