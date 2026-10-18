import { AuthRequiredError, createServer as create, InvalidRequestError } from "@atproto/xrpc-server";

export const createServer = (lexicons) => (options) => () => create(lexicons, options);
export const router = (s) => s.router;
export const toForeign = (x) => x;

const decodeOutput = (o) => {
  if (o.kind === "empty") return undefined;
  if (o.kind === "success") {
    const r = { encoding: o.encoding, body: o.body };
    if (Object.keys(o.headers).length > 0) r.headers = o.headers;
    return r;
  }
  if (o.kind === "buffer") return { encoding: o.encoding, buffer: o.body };
  const e = { status: o.status, message: o.message };
  if (o.error !== null) e.error = o.error;
  return e;
};

const decodeAuth = (a) => {
  if (a.kind === "credentials") return { credentials: a.credentials };
  if (a.kind === "error") return { status: a.status, message: a.message };
  return {};
};

export const methodImpl = (server, nsid, cfg) => {
  const config = {
    handler: (ctx) =>
      cfg
        .handler({
          params: ctx.params ?? {},
          input: ctx.input ?? null,
          auth: ctx.auth ?? null,
          req: ctx.req,
          res: ctx.res,
        })
        .then(decodeOutput),
  };
  if (cfg.auth !== null) config.auth = (ctx) => cfg.auth({ req: ctx.req, res: ctx.res }).then(decodeAuth);
  server.method(nsid, config);
};

export const credentialsDidImpl = (auth) => {
  const did = auth?.credentials?.did;
  return typeof did === "string" ? did : null;
};

export const invalidRequestError = (m) => new InvalidRequestError(m);
export const authRequiredError = (m) => new AuthRequiredError(m);

export const invalidRequestNamedError = message => name => new InvalidRequestError(message, name);

export const isInvalidRequestError = error => error instanceof InvalidRequestError;
