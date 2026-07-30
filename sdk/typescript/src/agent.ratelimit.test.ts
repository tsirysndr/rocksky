import { describe, expect, test } from "bun:test";

import { Agent, MAX_SAFE_WRITES_PER_HOUR, DEFAULT_MATCH_SONG_PER_HOUR } from "./agent.js";

/**
 * A fake XRPC client that counts writes and records the wall-clock time of each
 * one, without ever touching a PDS. Nothing here talks to the network.
 */
function fakeAgent(pds: string): {
  agent: Agent;
  writeTimes: number[];
} {
  const writeTimes: number[] = [];
  let n = 0;
  const rpc = {
    async post(nsid: string, opts: { input: { collection: string } }) {
      if (
        nsid === "com.atproto.repo.createRecord" ||
        nsid === "com.atproto.repo.putRecord" ||
        nsid === "com.atproto.repo.deleteRecord"
      ) {
        writeTimes.push(Date.now());
        return { ok: true, data: { uri: `at://did:plc:test/${opts.input.collection}/rec${++n}` } };
      }
      return { ok: false, data: { error: "UnexpectedCall", message: nsid } };
    },
  };
  // The constructor is private (compile-time only); bun runs the source
  // directly, so we can instantiate with a stub client + no real session.
  const agent = new (Agent as unknown as new (...a: unknown[]) => Agent)(rpc, "did:plc:test", {}, pds);
  return { agent, writeTimes };
}

const OFFICIAL = "https://amanita.us-east.host.bsky.network";
const SELFHOSTED = "https://pds.example.com";

describe("Agent PDS identity", () => {
  test("recognizes the official Bluesky PDS by *.bsky.network host", () => {
    expect(fakeAgent(OFFICIAL).agent.isOfficialBlueskyPds).toBe(true);
    expect(fakeAgent("https://bsky.network").agent.isOfficialBlueskyPds).toBe(true);
    expect(fakeAgent("https://Puffball.US-West.HOST.BSKY.NETWORK").agent.isOfficialBlueskyPds).toBe(true);
  });

  test("a self-hosted PDS is not treated as official", () => {
    expect(fakeAgent(SELFHOSTED).agent.isOfficialBlueskyPds).toBe(false);
    // A look-alike host that only *contains* the string must not match.
    expect(fakeAgent("https://not-bsky.network.evil.com").agent.isOfficialBlueskyPds).toBe(false);
    expect(fakeAgent("https://bsky.network.evil.com").agent.isOfficialBlueskyPds).toBe(false);
  });

  test("exposes the resolved PDS host", () => {
    expect(fakeAgent(SELFHOSTED).agent.pdsHost).toBe("pds.example.com");
  });
});

describe("configureRateLimit policy (guard is authoritative)", () => {
  test("self-hosted: disabling turns the throttle fully off", () => {
    const { agent } = fakeAgent(SELFHOSTED);
    const state = agent.configureRateLimit({ disabled: true });
    expect(state.enabled).toBe(false);
    expect(state.forcedOn).toBe(false);
    expect(state.writesPerHour).toBe(Infinity);
  });

  test("official Bluesky: disabling is IGNORED — throttle forced back on at the safe rate", () => {
    const { agent } = fakeAgent(OFFICIAL);
    const state = agent.configureRateLimit({ disabled: true });
    expect(state.enabled).toBe(true);
    expect(state.forcedOn).toBe(true);
    expect(state.writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
  });

  test("official Bluesky: a huge writesPerHour is clamped to the safe ceiling", () => {
    const { agent } = fakeAgent(OFFICIAL);
    const state = agent.configureRateLimit({ writesPerHour: 1_000_000 });
    expect(state.enabled).toBe(true);
    expect(state.capped).toBe(true);
    expect(state.writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
  });

  test("official Bluesky: even disabled+huge can never exceed the points budget", () => {
    const { agent } = fakeAgent(OFFICIAL);
    const state = agent.configureRateLimit({ disabled: true, writesPerHour: 1_000_000 });
    expect(state.writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
    // Sanity: the effective rate stays inside Bluesky's ~5000 points/hour budget.
    expect(state.writesPerHour * 3).toBeLessThanOrEqual(5000);
  });

  test("self-hosted: a custom writesPerHour above the Bluesky ceiling is honored, not clamped", () => {
    const { agent } = fakeAgent(SELFHOSTED);
    const state = agent.configureRateLimit({ writesPerHour: 1_000_000 });
    expect(state.enabled).toBe(true);
    expect(state.capped).toBe(false);
    expect(state.writesPerHour).toBe(1_000_000);
  });

  test("default (no options) enables the throttle at the safe rate on any PDS", () => {
    expect(fakeAgent(SELFHOSTED).agent.configureRateLimit().writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
    expect(fakeAgent(OFFICIAL).agent.configureRateLimit().writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
  });

  test("a zero / NaN writesPerHour falls back to the safe rate, never 'unlimited'", () => {
    const { agent } = fakeAgent(SELFHOSTED);
    expect(agent.configureRateLimit({ writesPerHour: 0 }).writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
    expect(agent.configureRateLimit({ writesPerHour: NaN }).writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
    expect(agent.configureRateLimit({ writesPerHour: -5 }).writesPerHour).toBe(MAX_SAFE_WRITES_PER_HOUR);
  });
});

describe("matchSong AppView throttle is ALWAYS enforced", () => {
  test("default matchSong rate is derived from the AppView's per-IP budget", () => {
    // 1000 req / 30s * 0.9 * 3600 = 108,000/h — and never exceeds the raw budget.
    expect(DEFAULT_MATCH_SONG_PER_HOUR).toBe(108_000);
    expect(DEFAULT_MATCH_SONG_PER_HOUR / 3600).toBeLessThanOrEqual((1000 / 30));
    expect(fakeAgent(SELFHOSTED).agent.configureRateLimit().matchSongPerHour).toBe(DEFAULT_MATCH_SONG_PER_HOUR);
  });

  test("disabling the write throttle does NOT disable matchSong (self-hosted)", () => {
    const { agent } = fakeAgent(SELFHOSTED);
    const state = agent.configureRateLimit({ disabled: true });
    expect(state.enabled).toBe(false); // writes off
    expect(state.matchSongPerHour).toBe(DEFAULT_MATCH_SONG_PER_HOUR); // matchSong still on
  });

  test("matchSongPerHour can be retuned and persists across calls", () => {
    const { agent } = fakeAgent(SELFHOSTED);
    expect(agent.configureRateLimit({ matchSongPerHour: 500 }).matchSongPerHour).toBe(500);
    // A later call that doesn't mention matchSong keeps the tuned value.
    expect(agent.configureRateLimit({ disabled: true }).matchSongPerHour).toBe(500);
    // Non-positive values are ignored (never turns matchSong off).
    expect(agent.configureRateLimit({ matchSongPerHour: 0 }).matchSongPerHour).toBe(500);
    expect(agent.configureRateLimit({ matchSongPerHour: -1 }).matchSongPerHour).toBe(500);
  });
});

describe("throttle behavior (observable, no real PDS)", () => {
  test("by default there is no throttle — a burst of writes runs back-to-back", async () => {
    const { agent, writeTimes } = fakeAgent(SELFHOSTED);
    for (let i = 0; i < 5; i++) await agent.createArtist({ name: `Artist ${i}` });
    expect(writeTimes).toHaveLength(5);
    // No configured limit → the whole burst completes near-instantly.
    expect(writeTimes.at(-1)! - writeTimes[0]!).toBeLessThan(50);
  });

  test("when enabled, writes are spaced at least the configured interval apart", async () => {
    const { agent, writeTimes } = fakeAgent(SELFHOSTED);
    // 180k writes/hour → 20ms minimum spacing; keeps the test fast but measurable.
    agent.configureRateLimit({ writesPerHour: 180_000 });
    const N = 4;
    for (let i = 0; i < N; i++) await agent.createArtist({ name: `Artist ${i}` });
    expect(writeTimes).toHaveLength(N);
    // (N-1) gaps of ~20ms each; allow slack for timer jitter but require real spacing.
    const elapsed = writeTimes.at(-1)! - writeTimes[0]!;
    expect(elapsed).toBeGreaterThanOrEqual((N - 1) * 20 * 0.8);
  });

  test("disabling after enabling removes the spacing again (self-hosted)", async () => {
    const { agent, writeTimes } = fakeAgent(SELFHOSTED);
    agent.configureRateLimit({ writesPerHour: 180_000 });
    agent.configureRateLimit({ disabled: true });
    for (let i = 0; i < 5; i++) await agent.createArtist({ name: `Artist ${i}` });
    expect(writeTimes.at(-1)! - writeTimes[0]!).toBeLessThan(50);
  });
});
