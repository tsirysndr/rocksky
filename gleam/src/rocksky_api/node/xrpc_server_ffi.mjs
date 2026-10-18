import { createServer as create, AuthRequiredError } from "@atproto/xrpc-server";
import { Ok } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";
import {
  NoContent,
  Anonymous,
  Authenticated,
  Json,
  JsonWithHeaders,
  Raw,
  Bytes,
  Fail,
  Request,
} from "./xrpc_server.mjs";

const opt = (v) => (v === undefined || v === null ? new None() : new Some(v));

export const createServer = (lexicons, o) =>
  create(lexicons.toArray(), {
    validateResponse: o.validate_response,
    payload: { jsonLimit: o.json_limit, textLimit: o.text_limit, blobLimit: o.blob_limit },
  });

const toOutput = (out) => {
  if (out instanceof NoContent) return undefined;
  if (out instanceof Json) return { encoding: "application/json", body: out.body };
  if (out instanceof JsonWithHeaders)
    return { encoding: "application/json", body: out.body, headers: Object.fromEntries(out.headers.toArray()) };
  if (out instanceof Raw) return { encoding: out.encoding, body: out.body };
  if (out instanceof Bytes)
    return { encoding: out.encoding, buffer: Buffer.from(out.body.rawBuffer ?? out.body.buffer) };
  if (out instanceof Fail) return { status: out.status, error: out.error, message: out.message };
  throw new Error("xrpc handler returned an unknown output");
};

const toAuth = (auth) => {
  const credentials = auth?.credentials;
  return credentials ? new Authenticated(credentials) : new Anonymous();
};

export const method = (server, nsid, auth, handler) => {
  const config = {
    handler: async (ctx) => {
      const request = new Request(
        ctx.params ?? {},
        opt(ctx.input?.body),
        opt(ctx.input?.encoding),
        toAuth(ctx.auth),
        ctx.req,
        ctx.res,
      );
      return toOutput(await handler(request));
    },
  };
  if (auth instanceof Some) {
    const verify = auth[0];
    config.auth = async ({ req }) => {
      const result = await verify(req);
      if (result instanceof Ok) {
        const a = result[0];
        return a instanceof Authenticated ? { credentials: a[0] } : {};
      }
      throw new AuthRequiredError(result[0]);
    };
  }
  server.method(nsid, config);
};

export const router = (server) => server.router;
