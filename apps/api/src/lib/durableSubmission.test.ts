import { describe, expect, it } from "bun:test";
import {
  enqueueSubmission,
  enqueueTealSubmission,
  submissionInput,
  submissionRecordKey,
  validSubmissionSecret,
} from "./durableSubmission";

const track = {
  title: "September",
  artist: "Earth, Wind & Fire",
  album: "The Best",
  albumArtist: "Earth, Wind & Fire",
  duration: 215000,
  timestamp: 1780000000,
  releaseDate: new Date("1978-11-18"),
};

describe("durable submission boundary", () => {
  it("keeps timestamped retries stable and separates listeners and plays", () => {
    const a = submissionInput("did:plc:a", track);
    expect(a).toEqual(submissionInput("did:plc:a", { ...track }));
    expect(
      a.idempotencyKey === submissionInput("did:plc:b", track).idempotencyKey,
    ).toBe(false);
    expect(
      a.idempotencyKey ===
        submissionInput("did:plc:a", {
          ...track,
          timestamp: track.timestamp + 300,
        }).idempotencyKey,
    ).toBe(false);
    expect(a.track.releaseDate).toBe("1978-11-18");
  });

  it("preserves explicit keys and does not invent unstable listening timestamps", () => {
    const input = submissionInput(
      "did:plc:a",
      { ...track, timestamp: undefined },
      "client-key",
    );
    expect(input.idempotencyKey).toBe("client-key");
    expect(input.track.timestamp).toBe(undefined);
  });

  it("uses a stable, valid record key on every worker retry", () => {
    const key = "3mv234567abcd";
    expect(submissionRecordKey(key)).toBe(key);
    expect(() => submissionRecordKey("../../untrusted")).toThrow();
  });

  it("requires a configured secret and rejects forged callback headers", () => {
    const secret = "a".repeat(32);
    expect(validSubmissionSecret(secret, secret)).toBe(true);
    expect(validSubmissionSecret("", "")).toBe(false);
    expect(validSubmissionSecret(undefined, secret)).toBe(false);
    expect(validSubmissionSecret("b".repeat(32), secret)).toBe(false);
  });

  it("never silently processes in memory when durable acceptance is unconfigured", async () => {
    let rejected = false;
    try {
      await enqueueSubmission({ url: "", secret: "" }, "did:plc:a", track);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
});

it("awaits durable Teal acceptance and preserves mirror provenance", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  const config = { url: "http://queue.test", secret: "s".repeat(32) };
  let status = 202;
  globalThis.fetch = (async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify({ id: "a".repeat(64) }), { status });
  }) as typeof fetch;
  try {
    await enqueueSubmission(config, "did:plc:test", track, "source-key", true);
    expect(calls[0].body.skipTeal).toBe(true);
    await enqueueTealSubmission(
      config,
      "did:plc:test",
      { trackName: "Song" },
      "parent-id",
    );
    expect(calls[1].url).toBe("http://queue.test/v1/tealfm");
    expect(calls[1].body.idempotencyKey).toBe("parent-id");
    status = 503;
    await expect(
      enqueueTealSubmission(config, "did:plc:test", {}, "parent-id"),
    ).rejects.toThrow("durably accepted");
  } finally {
    globalThis.fetch = original;
  }
});
