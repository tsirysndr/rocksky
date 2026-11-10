import { Hono } from "hono";

type Dependencies = {
  verifyToken: (token: string) => Promise<{ did?: string }>;
  hasSession: (did: string) => Promise<boolean>;
  restoreSession: (did: string) => Promise<unknown>;
};

// Separate from profile reads: cached public data says nothing about whether
// the server can still act on the viewer's behalf.
export function sessionApp(deps: Dependencies) {
  const app = new Hono();
  app.get("/status", async (c) => {
    c.header("Cache-Control", "no-store");
    const token = c.req.header("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return c.json({ error: "AuthMissing" }, 401);
    try {
      let did: string | undefined;
      try {
        ({ did } = await deps.verifyToken(token));
      } catch (error) {
        // Database outages during access-token verification are retryable.
        if (
          error instanceof Error &&
          ([
            "JsonWebTokenError",
            "TokenExpiredError",
            "NotBeforeError",
          ].includes(error.name) ||
            error.message === "Access token revoked")
        )
          return c.json({ error: "Unauthorized" }, 401);
        throw error;
      }
      if (!did) return c.json({ error: "Unauthorized" }, 401);
      const expired = () => c.json({ error: "pds_session_expired" }, 401);
      if (!(await deps.hasSession(did))) return expired();
      if (await deps.restoreSession(did)) return c.json({ active: true });
      // A failed restore is not proof of expiry. Only a missing session (also
      // how the OAuth SDK records a rejected refresh) warrants signing out.
      if (!(await deps.hasSession(did))) return expired();
      return c.json({ error: "session_unavailable" }, 503);
    } catch {
      return c.json({ error: "session_unavailable" }, 503);
    }
  });
  return app;
}
