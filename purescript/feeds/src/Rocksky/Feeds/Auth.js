import {DidResolver} from '@atproto/identity';
import {verifyJwt} from '@atproto/xrpc-server';
const resolver = new DidResolver({});
// Match the existing public service: verify signatures, without audience/lxm restrictions.
export const verifyImpl = token => async () =>
  (await verifyJwt(token, null, null, did => resolver.resolveAtprotoKey(did))).iss;
