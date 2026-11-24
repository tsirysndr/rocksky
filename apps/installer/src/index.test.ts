import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import worker from "./index";

const upstream = spyOn(globalThis, "fetch");
afterEach(() => upstream.mockReset());
afterAll(() => upstream.mockRestore());

test("preserves the CLI installer and routes playerd to its own script", async () => {
  for (const [path, file] of [
    ["/", "install.sh"],
    ["/playerd", "playerd/install.sh"],
    ["/playerd/", "playerd/install.sh"],
    ["/other", "install.sh"],
  ]) {
    upstream.mockResolvedValueOnce(
      new Response(file, {
        headers: { "Content-Type": "text/plain", ETag: "script-version" },
      }),
    );
    const response = await worker.fetch(
      new Request(`https://cli.rocksky.app${path}?ignored=1`, {
        headers: { Authorization: "Bearer private", Cookie: "private=1" },
      }),
    );
    expect(upstream).toHaveBeenLastCalledWith(
      `https://raw.githubusercontent.com/tsirysndr/rocksky/main/${file}`,
      { method: "GET" },
    );
    expect(await response.text()).toBe(file);
    expect(response.headers.get("ETag")).toBe("script-version");
  }
});

test("forwards HEAD and upstream failures without changing the status", async () => {
  upstream.mockResolvedValueOnce(new Response(null, { status: 404 }));
  const response = await worker.fetch(
    new Request("https://cli.rocksky.app/playerd", { method: "HEAD" }),
  );
  expect(response.status).toBe(404);
  expect(upstream).toHaveBeenLastCalledWith(
    "https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh",
    { method: "HEAD" },
  );
});

test("rejects writes and reports upstream connection failures", async () => {
  const response = await worker.fetch(
    new Request("https://cli.rocksky.app/playerd", { method: "POST" }),
  );
  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET, HEAD");
  expect(upstream).not.toHaveBeenCalled();
  upstream.mockRejectedValueOnce(new Error("unavailable"));
  expect(
    (await worker.fetch(new Request("https://cli.rocksky.app/playerd"))).status,
  ).toBe(502);
});
