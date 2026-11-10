import { afterEach, describe, expect, it, mock } from "bun:test";
import { createSessionMonitor } from "./session-monitor";

const originalFetch = globalThis.fetch;
let monitors: ReturnType<typeof createSessionMonitor>[] = [];
afterEach(() => {
  for (const monitor of monitors) monitor.stop();
  monitors = [];
  globalThis.fetch = originalFetch;
});

function setup(status = 200) {
  let token: string | null = "old-token";
  let active = true;
  const onExpired = mock(() => {});
  const fetchMock = mock(async () => new Response(null, { status }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const monitor = createSessionMonitor({
    apiUrl: "https://api.example.com/",
    getToken: () => token,
    isActive: () => active,
    onExpired,
  });
  monitors.push(monitor);
  return {
    monitor,
    fetchMock,
    onExpired,
    setToken: (value: string | null) => {
      token = value;
    },
    setActive: (value: boolean) => {
      active = value;
    },
  };
}

// Drain the initial automatic check before exercising subsequent events.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("session monitor", () => {
  it("checks at startup and signs out only once for concurrent expiry responses", async () => {
    const { monitor, fetchMock, onExpired } = setup(401);
    await Promise.all([monitor.check(), monitor.check()]);
    await settle();
    await monitor.check();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://api.example.com/session/status",
      expect.objectContaining({
        headers: { Authorization: "Bearer old-token" },
        cache: "no-store",
      }),
    ]);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("keeps the login on server errors, unknown endpoints and network failures", async () => {
    const { monitor, fetchMock, onExpired } = setup(503);
    await settle();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await monitor.check();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await monitor.check();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("ignores an old token's response after signing in again", async () => {
    const { monitor, fetchMock, setToken, onExpired } = setup();
    await settle();
    let respond!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const pending = monitor.check();
    setToken("new-token");
    respond(new Response(null, { status: 401 }));
    await pending;
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("skips background and signed-out checks and resumes in the foreground", async () => {
    const { monitor, fetchMock, setActive, setToken } = setup();
    await settle();
    setActive(false);
    await monitor.check();
    setActive(true);
    setToken(null);
    await monitor.check();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    setToken("new-token");
    await monitor.check();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores responses after the monitor unmounts", async () => {
    const { monitor, fetchMock, onExpired } = setup();
    await settle();
    let respond!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const pending = monitor.check();
    monitor.stop();
    respond(new Response(null, { status: 401 }));
    await pending;
    expect(onExpired).not.toHaveBeenCalled();
  });
});
