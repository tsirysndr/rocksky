import { fromUint8Array } from "@atcute/car";
import { decode as cborDecode, fromBytes, isBytes, isCidLink } from "@atcute/cbor";
import { toString as cidToString } from "@atcute/cid";
import { ClassicLevel } from "classic-level";

import { albumHash, artistHash, songHash } from "./hash.js";

const C_ARTIST = "app.rocksky.artist";
const C_ALBUM = "app.rocksky.album";
const C_SONG = "app.rocksky.song";
const C_SCROBBLE = "app.rocksky.scrobble";
const SEP = "\x00";

/** What an {@link RockskyIndex.indexCar} pass added. */
export interface IndexStats {
  artists: number;
  albums: number;
  songs: number;
  scrobbles: number;
}

export function totalIndexed(s: IndexStats): number {
  return s.artists + s.albums + s.songs + s.scrobbles;
}

function identKey(did: string, col: string, hash: string): string {
  return `${did}${SEP}${col}${SEP}${hash}`;
}
function scrobbleKey(did: string, songH: string, secs: number): string {
  return `${did}${SEP}${C_SCROBBLE}${SEP}${songH}${SEP}${secs}`;
}

function primaryFor(did: string, col: string, rec: Record<string, unknown>): string | undefined {
  const s = (k: string) => (typeof rec[k] === "string" ? (rec[k] as string) : "");
  switch (col) {
    case C_ARTIST:
      return s("name") ? identKey(did, C_ARTIST, artistHash(s("name"))) : undefined;
    case C_ALBUM:
      return s("title") && s("artist") ? identKey(did, C_ALBUM, albumHash(s("title"), s("artist"))) : undefined;
    case C_SONG:
      return s("title") && s("artist") && s("album")
        ? identKey(did, C_SONG, songHash(s("title"), s("artist"), s("album")))
        : undefined;
    case C_SCROBBLE: {
      if (s("title") && s("artist") && s("album") && s("createdAt")) {
        const secs = Math.floor(Date.parse(s("createdAt")) / 1000);
        if (!Number.isNaN(secs)) return scrobbleKey(did, songHash(s("title"), s("artist"), s("album")), secs);
      }
      return undefined;
    }
  }
  return undefined;
}

/**
 * Local duplicate-prevention mirror of a user's repo, keyed by Rocksky's
 * identity hashes, backed by an embedded LevelDB (classic-level). Built from the
 * repo CAR by {@link Agent.syncRepo} and kept live by {@link Agent.hydrateFromJetstream}.
 */
export class RockskyIndex {
  private db: ClassicLevel<string, string>;

  constructor(path: string) {
    this.db = new ClassicLevel<string, string>(path, { keyEncoding: "utf8", valueEncoding: "utf8" });
  }

  /** Open the database (call before use). */
  open(): Promise<void> {
    return this.db.open();
  }
  /** Close the database. */
  close(): Promise<void> {
    return this.db.close();
  }

  private async get(key: string): Promise<string | undefined> {
    try {
      return await this.db.get(key);
    } catch {
      return undefined; // NotFound
    }
  }

  songUri(did: string, title: string, artist: string, album: string): Promise<string | undefined> {
    return this.get(identKey(did, C_SONG, songHash(title, artist, album)));
  }
  albumUri(did: string, album: string, albumArtist: string): Promise<string | undefined> {
    return this.get(identKey(did, C_ALBUM, albumHash(album, albumArtist)));
  }
  artistUri(did: string, albumArtist: string): Promise<string | undefined> {
    return this.get(identKey(did, C_ARTIST, artistHash(albumArtist)));
  }
  scrobbleUri(did: string, title: string, artist: string, album: string, secs: number): Promise<string | undefined> {
    return this.get(scrobbleKey(did, songHash(title, artist, album), secs));
  }

  private async putPrimary(did: string, col: string, primary: string, uri: string): Promise<void> {
    const rkey = uri.slice(uri.lastIndexOf("/") + 1);
    await this.db.batch([
      { type: "put", key: primary, value: uri },
      { type: "put", key: `${SEP}rk${SEP}${did}${SEP}${col}${SEP}${rkey}`, value: primary },
    ]);
  }
  recordSong(did: string, title: string, artist: string, album: string, uri: string): Promise<void> {
    return this.putPrimary(did, C_SONG, identKey(did, C_SONG, songHash(title, artist, album)), uri);
  }
  recordAlbum(did: string, album: string, albumArtist: string, uri: string): Promise<void> {
    return this.putPrimary(did, C_ALBUM, identKey(did, C_ALBUM, albumHash(album, albumArtist)), uri);
  }
  recordArtist(did: string, albumArtist: string, uri: string): Promise<void> {
    return this.putPrimary(did, C_ARTIST, identKey(did, C_ARTIST, artistHash(albumArtist)), uri);
  }
  recordScrobble(did: string, title: string, artist: string, album: string, secs: number, uri: string): Promise<void> {
    return this.putPrimary(did, C_SCROBBLE, scrobbleKey(did, songHash(title, artist, album), secs), uri);
  }

  cursor(did: string): Promise<number> {
    return this.get(`${SEP}meta${SEP}cursor${SEP}${did}`).then((v) => (v ? Number(v) : 0));
  }
  async setCursor(did: string, timeUS: number): Promise<void> {
    await this.db.put(`${SEP}meta${SEP}cursor${SEP}${did}`, String(timeUS));
  }

  /** Ingest a full repo CAR for `did`, indexing song/album/artist/scrobble. */
  async indexCar(did: string, car: Uint8Array): Promise<IndexStats> {
    const reader = fromUint8Array(car);
    const blocks = new Map<string, Uint8Array>();
    for (const entry of reader) blocks.set(cidToString(entry.cid), entry.bytes);

    const root = reader.roots[0];
    if (!root) throw new Error("CAR has no root");
    const commit = cborDecode(blocks.get(root.$link)!) as { data: { $link: string }; rev?: string };

    const stats: IndexStats = { artists: 0, albums: 0, songs: 0, scrobbles: 0 };
    const ops: { type: "put"; key: string; value: string }[] = [];

    for (const [path, valueLink] of walkMst(blocks, commit.data.$link)) {
      const slash = path.indexOf("/");
      if (slash < 0) continue;
      const col = path.slice(0, slash);
      const rkey = path.slice(slash + 1);
      if (col !== C_ARTIST && col !== C_ALBUM && col !== C_SONG && col !== C_SCROBBLE) continue;
      const recBytes = blocks.get(valueLink);
      if (!recBytes) continue;
      const rec = cborDecode(recBytes) as Record<string, unknown>;
      const primary = primaryFor(did, col, rec);
      if (!primary) continue;
      const uri = `at://${did}/${col}/${rkey}`;
      ops.push({ type: "put", key: primary, value: uri });
      ops.push({ type: "put", key: `${SEP}rk${SEP}${did}${SEP}${col}${SEP}${rkey}`, value: primary });
      if (col === C_ARTIST) stats.artists++;
      else if (col === C_ALBUM) stats.albums++;
      else if (col === C_SONG) stats.songs++;
      else stats.scrobbles++;
    }
    if (commit.rev) ops.push({ type: "put", key: `${SEP}meta${SEP}rev${SEP}${did}`, value: commit.rev });
    await this.db.batch(ops);
    return stats;
  }

  /** Apply a single Jetstream commit event to the index. */
  async applyCommit(
    did: string,
    col: string,
    operation: string,
    rkey: string,
    record: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (operation === "create" || operation === "update") {
      if (!record) return;
      const primary = primaryFor(did, col, record);
      if (!primary) return;
      await this.putPrimary(did, col, primary, `at://${did}/${col}/${rkey}`);
    } else if (operation === "delete") {
      const rk = `${SEP}rk${SEP}${did}${SEP}${col}${SEP}${rkey}`;
      const primary = await this.get(rk);
      if (primary) {
        await this.db.batch([
          { type: "del", key: primary },
          { type: "del", key: rk },
        ]);
      }
    }
  }
}

// In-order MST traversal, reconstructing each leaf's full key. Yields
// [path, recordCidString]. Skips CIDs absent from `blocks`.
function* walkMst(blocks: Map<string, Uint8Array>, cid: string): Generator<[string, string]> {
  const raw = blocks.get(cid);
  if (!raw) return;
  const node = cborDecode(raw) as {
    l?: { $link: string } | null;
    e: { p: number; k: unknown; v: { $link: string }; t?: { $link: string } | null }[];
  };
  if (node.l && isCidLink(node.l)) yield* walkMst(blocks, node.l.$link);
  let last = new Uint8Array(0);
  for (const e of node.e) {
    const suffix = isBytes(e.k) ? fromBytes(e.k) : (e.k as Uint8Array);
    const key = new Uint8Array(e.p + suffix.length);
    key.set(last.subarray(0, e.p), 0);
    key.set(suffix, e.p);
    yield [new TextDecoder().decode(key), e.v.$link];
    last = key;
    if (e.t && isCidLink(e.t)) yield* walkMst(blocks, e.t.$link);
  }
}
