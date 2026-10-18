import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Ok, Error as GError, toList} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {Some,None} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import {negotiate,PrivateKeyJwt,Public} from '../build/dev/javascript/rocksky_api/rocksky_api/auth/oauth_client_auth.mjs';
import {parse_overrides,destination} from '../build/dev/javascript/rocksky_api/rocksky_api/lib/pds_proxy.mjs';

test('OAuth negotiation requires advertised authentication and a named compatible signing key',()=>{
 const methods=toList(['none','private_key_jwt','client_secret_basic']);
 assert.ok(negotiate('none',methods,new None(),new None())[0] instanceof Public);
 let result=negotiate('private_key_jwt',methods,new None(),new Some(toList(['','first','second'])));
 assert.ok(result[0] instanceof PrivateKeyJwt);assert.equal(result[0].kid,'first');
 assert.match(negotiate('private_key_jwt',methods,new None(),new None())[0],/keyset is required/);
 assert.match(negotiate('private_key_jwt',methods,new None(),new Some(toList([''])))[0],/ES256.*kid/);
 assert.match(negotiate('private_key_jwt',methods,new Some(toList(['RS256'])),new Some(toList([])))[0],/does not support "ES256"/);
 assert.match(negotiate('client_secret_basic',methods,new None(),new None())[0],/explicitly set/);
 assert.match(negotiate('none',toList(['private_key_jwt']),new None(),new None())[0],/does not support "none"/);
});

test('PDS overrides match parsed hosts, preserve logical paths and clear proxy ports',()=>{
 const pairs=parse_overrides(' PDS.EXAMPLE = Proxy.Example:8443 , pds.example=final.example:9000, unused=proxy=ignored, =bad');
 assert.equal(destination(pairs,'https://pds.example:123/path') instanceof None,true);
 assert.equal(destination(pairs,'https://unrelated.example/pds.example') instanceof None,true);
 assert.equal(destination(pairs,'not a URL pds.example') instanceof None,true);
 assert.equal(destination(pairs,'https://pds.example/a?x=1#fragment')[0],'https://final.example/a?x=1#fragment');
 assert.equal(destination(pairs,'https://unused/path')[0],'https://proxy/path');
});

test('OAuth authorization persists proof keys, forwards prompt, uses PAR and bounds redirect URLs',async()=>{
 const {authorize}=await import('../build/dev/javascript/rocksky_api/rocksky_api/auth/oauth_client.mjs');
 const saved=[],requests=[];
 const serverMetadata={issuer:'https://issuer.example',authorization_endpoint:'https://issuer.example/authorize?existing=1',token_endpoint_auth_methods_supported:['none']};
 const key={private:'opaque-sdk-key'};
 const client={clientMetadata:{client_id:'http://localhost',redirect_uris:['http://127.0.0.1/callback'],scope:'atproto',token_endpoint_auth_method:'none'},responseMode:'query',
 oauthResolver:{resolve:async(input,options)=>({identityInfo:{did:'did:plc:test'},metadata:serverMetadata})},
 runtime:{generatePKCE:async()=>({verifier:'verifier',challenge:'challenge',method:'S256'}),generateKey:async alg=>{assert.deepEqual(alg,['ES256']);return key;},generateNonce:async()=>'nonce'},
 stateStore:{set:async(...args)=>saved.push(args)},serverFactory:{fromMetadata:async(metadata,auth,dpop)=>{assert.equal(metadata,serverMetadata);assert.equal(dpop,key);assert.deepEqual(auth,{method:'none'});return {request:async(kind,params)=>{requests.push([kind,params]);return {request_uri:'urn:par:123'};}}}}};
 let result=await authorize(client,'user.example',{state:'app',prompt:'login',scope:'atproto repo:app.rocksky.song'});
 assert.ok(result instanceof Ok);let url=new URL(result[0]);
 assert.equal(url.searchParams.get('prompt'),'login');assert.equal(url.searchParams.has('login_hint'),false);
 assert.equal(url.searchParams.get('state'),'nonce');assert.equal(url.searchParams.get('code_challenge'),'challenge');
 assert.deepEqual(saved[0],['nonce',{iss:'https://issuer.example',authMethod:{method:'none'},dpopKey:key,verifier:'verifier',appState:'app'}]);
 result=await authorize(client,'user.example',{});assert.equal(new URL(result[0]).searchParams.get('login_hint'),'user.example');
 serverMetadata.pushed_authorization_request_endpoint='https://issuer.example/par';
 result=await authorize(client,'user.example',{prompt:'consent'});url=new URL(result[0]);
 assert.equal(url.searchParams.get('request_uri'),'urn:par:123');assert.equal(url.searchParams.has('code_challenge'),false);
 assert.equal(requests[0][0],'pushed_authorization_request');assert.equal(requests[0][1].prompt,'consent');
 delete serverMetadata.pushed_authorization_request_endpoint;
 serverMetadata.require_pushed_authorization_requests=true;
 result=await authorize(client,'user.example',{});assert.ok(result instanceof GError);assert.match(result[0][0],/requires pushed/);
 serverMetadata.require_pushed_authorization_requests=false;
 result=await authorize(client,'user.example',{scope:'x'.repeat(2048)});assert.match(result[0][0],/too long/);
 serverMetadata.authorization_endpoint='javascript:alert(1)';
 result=await authorize(client,'user.example',{});assert.match(result[0][0],/Invalid authorization endpoint protocol/);
 const count=saved.length;
 result=await authorize(client,'user.example',{redirect_uri:'https://attacker.example'});assert.match(result[0][0],/Invalid redirect_uri/);assert.equal(saved.length,count);
});
