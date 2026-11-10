import { describe, expect, it, mock } from "bun:test";
import { sessionApp } from "./app";

function setup() {
  const deps = {
    verifyToken: mock(async (_token: string) => ({ did: "did:plc:alice" })),
    hasSession: mock(async (_did: string) => true),
    restoreSession: mock(async (_did: string): Promise<unknown> => ({})),
  };
  const app = sessionApp(deps);
  const request = () =>
    app.request("/status", {
      headers: { Authorization: "Bearer rocksky-token" },
    });
  return { deps, app, request };
}

describe("session status", () => {
  it("requires a token and never caches the response", async () => {
    const { app, deps } = setup();
    const response = await app.request("/status");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(deps.restoreSession).not.toHaveBeenCalled();
  });

  it("checks the PDS session even when the Rocksky token is valid", async () => {
    const { deps, request } = setup();
    deps.hasSession.mockResolvedValue(false);
    const response = await request();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "pds_session_expired" });
    expect(deps.restoreSession).not.toHaveBeenCalled();
  });

  it("accepts a successfully restored session", async () => {
    const { deps, request } = setup();
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: true });
    expect(deps.restoreSession).toHaveBeenCalledWith("did:plc:alice");
  });

  it("detects a session deleted during a rejected OAuth refresh", async () => {
    const { deps, request } = setup();
    deps.hasSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    deps.restoreSession.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
  });

  it("keeps the user logged in when restore temporarily fails", async () => {
    const { deps, request } = setup();
    deps.restoreSession.mockResolvedValue(null);
    expect((await request()).status).toBe(503);
  });

  it("does not turn a database failure into an expiry", async () => {
    const { deps, request } = setup();
    deps.hasSession.mockRejectedValue(new Error("database unavailable"));
    expect((await request()).status).toBe(503);
    deps.verifyToken.mockRejectedValue(new Error("database unavailable"));
    expect((await request()).status).toBe(503);
  });

  it("rejects an invalid Rocksky token", async () => {
    const { deps, request } = setup();
    const error = new Error("invalid signature");
    error.name = "JsonWebTokenError";
    deps.verifyToken.mockRejectedValue(error);
    expect((await request()).status).toBe(401);
  });
});
