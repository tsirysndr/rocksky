// ReScript emits an untyped `.res.mjs` runtime file next to each `.res` source
// (in-source build, see rescript.json). The typed surface lives in the genType
// `.gen.tsx` files, which re-export these runtime values with real types via an
// `as any` cast. This ambient declaration lets TS resolve the `.res.mjs` import
// inside those generated files without tripping `noImplicitAny` under strict.
//
// Always import ReScript modules through their `.gen` file, never `.res.mjs`
// directly — the `.gen` file is where the types are.
declare module "*.res.mjs";
