import assert from 'node:assert/strict';
const A=await import('../output/Rocksky.Auth.OauthClientAuth/index.js');const C=await import('../output/Rocksky.Auth.OauthClient/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();
const negotiate=(server,method,keyset)=>A.negotiateClientAuthMethod(server)({token_endpoint_auth_method:method})(keyset)();
const server={token_endpoint_auth_methods_supported:['none','private_key_jwt','client_secret_basic','weird']};
assert.deepEqual(negotiate(server,'none'),{method:'none'});assert.throws(()=>negotiate(server,'unsupported'),/does not support "unsupported"/);assert.throws(()=>negotiate(server,'private_key_jwt'),/keyset is required/);assert.throws(()=>negotiate(server,'client_secret_basic'),/explicitly set/);assert.throws(()=>negotiate(server,'weird'),/not allowed/);
let listed;const keyset={list(options){listed=options;return [{kid:''},{kid:'key-1'},{kid:'key-2'}]}};assert.deepEqual(negotiate(server,'private_key_jwt',keyset),{method:'private_key_jwt',kid:'key-1'});assert.deepEqual(listed,{alg:['ES256'],usage:'sign'});assert.throws(()=>negotiate(server,'private_key_jwt',{list:()=>[]}),/requires at least one "ES256"/);assert.throws(()=>negotiate({...server,token_endpoint_auth_signing_alg_values_supported:['RS256']},'private_key_jwt',{list:()=>[]}),/does not support "ES256"/);
function mock(metadataOverrides={},identityInfo={handle:'resolved.example'}){
 const calls=[],states=[];const metadata={...server,issuer:'https://issuer.test',authorization_endpoint:'https://issuer.test/authorize?existing=yes',...metadataOverrides};
 const client={clientMetadata:{client_id:'https://client.test/client.json',redirect_uris:['https://client.test/callback'],scope:'atproto',token_endpoint_auth_method:'none'},responseMode:'query',oauthResolver:{async resolve(input,options){calls.push(['resolve',input,options]);return {identityInfo,metadata}}},runtime:{async generatePKCE(){calls.push(['pkce']);return {verifier:'verifier',challenge:'challenge',method:'S256'}},async generateKey(algs){calls.push(['key',algs]);return 'dpop'},async generateNonce(){return 'nonce'}},stateStore:{async set(state,value){states.push({state,value})}},serverFactory:{async fromMetadata(m,auth,key){calls.push(['server',m,auth,key]);return {async request(name,params){calls.push(['request',name,params]);return {request_uri:'urn:par:test'}}}}}};return {client,calls,states};
}
{
 const m=mock();const signal={mock:true};const result=new URL(await run(C.authorize(m.client)('raw.example')({signal,state:'app',scope:'custom',prompt:undefined,extra:'yes',falsy:false,zero:0})));
 assert.equal(result.searchParams.get('login_hint'),'raw.example');assert.equal(result.searchParams.get('scope'),'custom');assert.equal(result.searchParams.get('extra'),'yes');assert.equal(result.searchParams.get('existing'),'yes');assert.equal(result.searchParams.has('signal'),false);assert.equal(result.searchParams.has('falsy'),false);assert.equal(result.searchParams.has('zero'),false);assert.deepEqual(m.calls[0],['resolve','raw.example',{signal}]);assert.deepEqual(m.calls[2],['key',['ES256']]);assert.deepEqual(m.states,[{state:'nonce',value:{iss:'https://issuer.test',authMethod:{method:'none'},dpopKey:'dpop',verifier:'verifier',appState:'app'}}]);
}
for(const [options,identity] of [[{prompt:'create'},{}],[{},null]]){const m=mock({},identity);const u=new URL(await run(C.authorize(m.client)('raw.example')(options)));assert.equal(u.searchParams.has('login_hint'),false)}
{
 const m=mock({pushed_authorization_request_endpoint:'https://issuer.test/par'});C.install(m.client)();const url=await m.client.authorize('raw.example',{state:'app'});assert.ok(url instanceof URL);assert.equal(url.searchParams.get('request_uri'),'urn:par:test');assert.equal(url.searchParams.has('login_hint'),false);const call=m.calls.find(c=>c[0]==='request');assert.equal(call[1],'pushed_authorization_request');assert.equal(call[2].login_hint,'raw.example');assert.equal(call[2].state,'nonce');assert.equal(call[2].response_mode,'query');
}
{
 const m=mock();await assert.rejects(run(C.authorize(m.client)('x')({redirect_uri:'https://evil.test'})),e=>e instanceof TypeError&&e.message==='Invalid redirect_uri');assert.equal(m.calls.length,0);
}
for(const [overrides,options,regex] of [[{authorization_endpoint:'ftp://issuer.test'}, {},/Invalid authorization endpoint protocol: ftp:/],[{require_pushed_authorization_requests:true},{},/requires pushed authorization/],[{}, {extra:'x'.repeat(2200)},/Login URL too long/]]){
 const m=mock(overrides);await assert.rejects(run(C.authorize(m.client)('raw.example')(options)),regex);
}
console.log('OAuth: auth negotiation, kid selection, raw login hints, prompt omission, PKCE/state, PAR, URL validation/limits, signal forwarding and installed override passed');
