import { describe, expect, test } from "bun:test";

import { Agent } from "./agent.js";
import type { ScrobbleInput } from "./agent.js";

const DID = "did:plc:test";

const C_ARTIST = "app.rocksky.artist";
const C_ALBUM = "app.rocksky.album";
const C_SONG = "app.rocksky.song";
const C_SCROBBLE = "app.rocksky.scrobble";

/**
 * A fake XRPC client that captures every `createRecord` call instead of hitting
 * a PDS. Nothing here talks to the network. Returns a fresh at:// URI per write.
 */
function fakeAgent(idx?: unknown): {
  agent: Agent;
  created: { collection: string; record: Record<string, unknown> }[];
} {
  const created: { collection: string; record: Record<string, unknown> }[] = [];
  let n = 0;
  const rpc = {
    async post(nsid: string, opts: { input: { collection: string; record: Record<string, unknown> } }) {
      if (nsid === "com.atproto.repo.createRecord") {
        const { collection, record } = opts.input;
        created.push({ collection, record });
        return { ok: true, data: { uri: `at://${DID}/${collection}/rec${++n}` } };
      }
      return { ok: false, data: { error: "UnexpectedCall", message: nsid } };
    },
  };
  // The constructor is private (compile-time only); bun runs the source
  // directly, so we can instantiate with a stub client + no real session.
  const agent = new (Agent as unknown as new (...a: unknown[]) => Agent)(rpc, DID, {}, "https://pds.test");
  if (idx) agent.useIndex(idx as never);
  return { agent, created };
}

/**
 * In-memory stand-in for {@link RockskyIndex}: mirrors the exact identity
 * semantics the Agent relies on (artist by name, album by title+artist, song by
 * title+artist+album, scrobble by song+second), without LevelDB or a PDS.
 */
function memIndex() {
  const map = new Map<string, string>();
  const k = (...parts: (string | number)[]) => parts.join("\x00");
  return {
    artistUri: async (_d: string, name: string) => map.get(k("artist", name)),
    albumUri: async (_d: string, album: string, albumArtist: string) => map.get(k("album", album, albumArtist)),
    songUri: async (_d: string, title: string, artist: string, album: string) =>
      map.get(k("song", title, artist, album)),
    scrobbleUri: async (_d: string, title: string, artist: string, album: string, secs: number) =>
      map.get(k("scrobble", title, artist, album, secs)),
    recordArtist: async (_d: string, name: string, uri: string) => void map.set(k("artist", name), uri),
    recordAlbum: async (_d: string, album: string, albumArtist: string, uri: string) =>
      void map.set(k("album", album, albumArtist), uri),
    recordSong: async (_d: string, title: string, artist: string, album: string, uri: string) =>
      void map.set(k("song", title, artist, album), uri),
    recordScrobble: async (_d: string, title: string, artist: string, album: string, secs: number, uri: string) =>
      void map.set(k("scrobble", title, artist, album, secs), uri),
  };
}

const FULL: ScrobbleInput = {
  title: "Song A",
  artist: "Artist A",
  albumArtist: "Artist A",
  album: "Album A",
  duration: 210_000,
  year: 2021,
  genre: "rock",
  spotifyLink: "https://open.spotify.com/track/xyz",
  albumArtUrl: "https://cdn.test/art.jpg",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const cols = (created: { collection: string }[]) => created.map((c) => c.collection);

describe("Agent.scrobble metadata publishing", () => {
  test("publishes artist, album, song, then the scrobble — in that order", async () => {
    const { agent, created } = fakeAgent(memIndex());
    await agent.scrobble(FULL);
    expect(cols(created)).toEqual([C_ARTIST, C_ALBUM, C_SONG, C_SCROBBLE]);
  });

  test("stamps $type on every published record", async () => {
    const { agent, created } = fakeAgent(memIndex());
    await agent.scrobble(FULL);
    for (const { collection, record } of created) expect(record.$type).toBe(collection);
  });

  test("derives album (title=album, artist=albumArtist) and copies scrobble fields to song", async () => {
    const { agent, created } = fakeAgent(memIndex());
    await agent.scrobble(FULL);
    const album = created.find((c) => c.collection === C_ALBUM)!.record;
    expect(album.title).toBe("Album A");
    expect(album.artist).toBe("Artist A");
    expect(album.year).toBe(2021);
    expect(album.spotifyLink).toBe("https://open.spotify.com/track/xyz");

    const artist = created.find((c) => c.collection === C_ARTIST)!.record;
    expect(artist.name).toBe("Artist A");

    const song = created.find((c) => c.collection === C_SONG)!.record;
    expect(song.title).toBe("Song A");
    expect(song.artist).toBe("Artist A");
    expect(song.album).toBe("Album A");
    expect(song.duration).toBe(210_000);
    // createdAt propagates from the scrobble to every derived record.
    for (const { record } of created) expect(record.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("Agent.scrobble dedup (never republish what's already in the PDS)", () => {
  test("a second play of the same song reuses artist/album/song, writes only the scrobble", async () => {
    const idx = memIndex();
    const { agent, created } = fakeAgent(idx);
    await agent.scrobble(FULL);
    created.length = 0; // ignore the first play's writes

    await agent.scrobble({ ...FULL, createdAt: "2024-01-01T01:00:00.000Z" });
    expect(cols(created)).toEqual([C_SCROBBLE]);
  });

  test("an exact-duplicate scrobble (same second) writes nothing and returns the existing uri", async () => {
    const idx = memIndex();
    const { agent, created } = fakeAgent(idx);
    const uri1 = await agent.scrobble(FULL);
    created.length = 0;

    const uri2 = await agent.scrobble(FULL);
    expect(uri2).toBe(uri1);
    expect(created).toHaveLength(0);
  });

  test("without an index there is no dedup — every play republishes all four records", async () => {
    const { agent, created } = fakeAgent();
    await agent.scrobble(FULL);
    await agent.scrobble(FULL);
    expect(cols(created)).toEqual([
      C_ARTIST,
      C_ALBUM,
      C_SONG,
      C_SCROBBLE,
      C_ARTIST,
      C_ALBUM,
      C_SONG,
      C_SCROBBLE,
    ]);
  });
});

describe("Agent.scrobble identity guards (skip records that can't be deduped)", () => {
  test("empty album skips album + song (no stable identity), still writes artist + scrobble", async () => {
    const { agent, created } = fakeAgent(memIndex());
    await agent.scrobble({ title: "T", artist: "A", albumArtist: "A", album: "", duration: 0 });
    expect(cols(created)).toEqual([C_ARTIST, C_SCROBBLE]);
  });

  test("empty albumArtist skips artist + album, still writes song + scrobble", async () => {
    const { agent, created } = fakeAgent(memIndex());
    await agent.scrobble({ title: "T", artist: "A", albumArtist: "", album: "Alb", duration: 0 });
    expect(cols(created)).toEqual([C_SONG, C_SCROBBLE]);
  });
});
