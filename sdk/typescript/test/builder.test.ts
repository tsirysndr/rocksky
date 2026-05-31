import { describe, expect, it } from "bun:test";
import { RockskyClient } from "../src";
import { mockFetch } from "./_mock";

describe("RockskyClientBuilder", () => {
  it("composes a client with all options", async () => {
    const { fetchImpl, calls } = mockFetch();
    const client = RockskyClient.builder()
      .baseUrl("https://api.example.test")
      .bearer("xyz")
      .fetch(fetchImpl)
      .userAgent("rocksky-test/0.1")
      .header("x-custom", "1")
      .timeout(5000)
      .retries(2)
      .retryDelay(50)
      .build();

    expect(client).toBeInstanceOf(RockskyClient);
    expect(client.config.baseUrl).toBe("https://api.example.test");
    expect(client.config.timeoutMs).toBe(5000);
    expect(client.config.retries).toBe(2);

    await client.actor.getProfile({ did: "did:plc:a" });
    const c = calls[0]!;
    expect(c.url).toContain("https://api.example.test/xrpc/app.rocksky.actor.getProfile");
    expect(c.headers.authorization).toBe("Bearer xyz");
    expect(c.headers["user-agent"]).toBe("rocksky-test/0.1");
    expect(c.headers["x-custom"]).toBe("1");
  });

  it("auth() accepts a function", async () => {
    const { fetchImpl, calls } = mockFetch();
    const client = RockskyClient.builder()
      .fetch(fetchImpl)
      .auth(() => "dynamic-token")
      .build();
    await client.actor.getProfile();
    expect(calls[0]!.headers.authorization).toBe("Bearer dynamic-token");
  });
});
