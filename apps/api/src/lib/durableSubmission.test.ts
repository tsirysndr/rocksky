import { describe, expect, it } from "bun:test";
import {
  enqueueSubmission,
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
