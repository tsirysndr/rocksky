import { afterEach, expect, spyOn, test } from "bun:test";
import { Agent } from "./agent.js";
import { RockskyError } from "./errors.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const input = {
  title: "Good Riddance", artist: "Green Day", album: "Nimrod",
  mbId: "recording-id", isrc: "USRE19700529", timestamp: 1500000000,
};
function setup(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;
  const agent = new (Agent as unknown as new (...args: unknown[]) => Agent)(
    {}, "did:plc:test", {}, "https://pds.example.com",
  );
  const write = spyOn(agent, "scrobble").mockResolvedValue("at://dry-run/scrobble/1");
  return { agent, write };
}
for (const status of [400, 404]) {
  test(`matching NotFound (${status}) preserves the imported listen`, async () => {
    const { agent, write } = setup(status, { error: "NotFound", message: "No unambiguous song match" });
    await agent.scrobbleMatch(input);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toEqual({
      title: input.title, artist: input.artist, album: input.album, albumArtist: input.artist,
      duration: 0, mbid: input.mbId, isrc: input.isrc,
      createdAt: "2017-07-14T02:40:00.000Z",
    });
  });
}
test("successful matches still enrich the imported listen", async () => {
  const { agent, write } = setup(200, {
    title: "Good Riddance (Time of Your Life)", artist: "Green Day", duration: 154000,
  });
  await agent.scrobbleMatch(input);
  expect(write.mock.calls[0]![0]).toMatchObject({
    title: "Good Riddance (Time of Your Life)", duration: 154000,
    album: input.album, createdAt: "2017-07-14T02:40:00.000Z",
  });
});
for (const [status, error] of [[503, "NotEnoughResources"], [429, "RateLimitExceeded"], [401, "AuthRequired"], [400, "InvalidRequest"]] as const) {
  test(`${error} propagates without writing a raw listen`, async () => {
    const { agent, write } = setup(status, { error, message: error });
    await expect(agent.scrobbleMatch(input)).rejects.toMatchObject({ kind: error, status });
    expect(write).not.toHaveBeenCalled();
  });
}
test("a PDS NotFound is never mistaken for a matching miss", async () => {
  const { agent, write } = setup(200, { title: input.title, artist: input.artist });
  write.mockRejectedValue(new RockskyError({ error: "NotFound", message: "Record not found" }, 400));
  await expect(agent.scrobbleMatch(input)).rejects.toThrow("Record not found");
  expect(write).toHaveBeenCalledTimes(1);
});
