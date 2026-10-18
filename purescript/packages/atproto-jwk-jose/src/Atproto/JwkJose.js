import { JoseKey } from "@atproto/jwk-jose";
export const fromImportableImpl = (s) => () => JoseKey.fromImportable(s);
