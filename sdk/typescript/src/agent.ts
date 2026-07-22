import { Client } from "@atcute/client";
import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  DohJsonHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { PasswordSession } from "@atcute/password-session";

import { RockskyError } from "./errors.js";
import type {
  AlbumRecord,
  ArtistRecord,
  ActorTrackView,
  ScrobbleRecord,
  SongRecord,
} from "./generated/types.js";
import type { IndexStats, RockskyIndex } from "./dedup.js";
import { runJetstream, type JetstreamOptions } from "./jetstream.js";

// Collection NSIDs written by the agent.
const C_SCROBBLE = "app.rocksky.scrobble";
const C_SONG = "app.rocksky.song";
const C_ALBUM = "app.rocksky.album";
const C_ARTIST = "app.rocksky.artist";
const C_LIKE = "app.rocksky.like";
const C_FOLLOW = "app.rocksky.graph.follow";
const C_SHOUT = "app.rocksky.shout";
const C_STATUS = "app.rocksky.actor.status";

function actorResolver(): LocalActorResolver {
  return new LocalActorResolver({
    handleResolver: new CompositeHandleResolver({
      methods: {
        dns: new DohJsonHandleResolver({ dohUrl: "https://mozilla.cloudflare-dns.com/dns-query" }),
        http: new WellKnownHandleResolver(),
      },
    }),
    didDocumentResolver: new CompositeDidDocumentResolver({
      methods: { plc: new PlcDidDocumentResolver(), web: new WebDidDocumentResolver() },
    }),
  });
}

function nowISO(): string {
  return new Date().toISOString();
}

// Write inputs: `createdAt` is optional (the SDK defaults it to now).
/** Input for {@link Agent.scrobble} (createdAt defaults to now). */
export type ScrobbleInput = Omit<ScrobbleRecord, "createdAt"> & { createdAt?: string };
/** Input for {@link Agent.createSong}. */
export type SongInput = Omit<SongRecord, "createdAt"> & { createdAt?: string };
/** Input for {@link Agent.createAlbum} (`artist` is the album artist). */
export type AlbumInput = Omit<AlbumRecord, "createdAt"> & { createdAt?: string };
/** Input for {@link Agent.createArtist}. */
export type ArtistInput = Omit<ArtistRecord, "createdAt"> & { createdAt?: string };

/**
 * Authenticated Rocksky client: logs in with an app password and writes
 * app.rocksky.* records to the user's PDS (via atcute). Attach a
 * {@link RockskyIndex} with {@link Agent.useIndex} for duplicate prevention.
 */
export class Agent {
  private idx?: RockskyIndex;

  private constructor(
    private rpc: Client,
    readonly did: string,
    readonly session: PasswordSession,
    private pds: string,
  ) {}

  /**
   * Resolve the account's PDS, authenticate with an app password, and return an
   * Agent. `identifier` is a handle or DID.
   */
  static async login(identifier: string, password: string): Promise<Agent> {
    const actor = await actorResolver().resolve(identifier as never);
    const session = await PasswordSession.login({ service: actor.pds, identifier, password });
    return new Agent(new Client({ handler: session }), session.did, session, actor.pds);
  }

  /** Attach a local dedup index — write verbs then skip records that already exist. */
  useIndex(idx: RockskyIndex): void {
    this.idx = idx;
  }

  /**
   * Download the caller's full repository and (re)build the dedup index. Requires
   * an attached index ({@link Agent.useIndex}). Full backfill; keep it current
   * with {@link Agent.hydrateFromJetstream}.
   */
  async syncRepo(): Promise<IndexStats> {
    if (!this.idx) throw new Error("no dedup index attached (call useIndex)");
    const url = `${this.pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(this.did)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getRepo: ${res.status}`);
    const car = new Uint8Array(await res.arrayBuffer());
    return this.idx.indexCar(this.did, car);
  }

  /**
   * Keep the dedup index live from the Bluesky Jetstream firehose (all four
   * servers at once, filtered to this DID + app.rocksky.*). Resolves when the
   * options' AbortSignal fires. Requires an attached index.
   */
  hydrateFromJetstream(opts: JetstreamOptions = {}): Promise<void> {
    if (!this.idx) throw new Error("no dedup index attached (call useIndex)");
    return runJetstream(this.idx, this.did, opts);
  }

  private async create(collection: string, record: Record<string, unknown>): Promise<string> {
    const res = await this.rpc.post("com.atproto.repo.createRecord" as never, {
      input: { repo: this.did, collection, record: { ...record, $type: collection } },
    } as never);
    if (!res.ok) throw new RockskyError(res.data);
    return (res.data as { uri: string }).uri;
  }

  private async putRecord(collection: string, rkey: string, record: Record<string, unknown>): Promise<string> {
    const res = await this.rpc.post("com.atproto.repo.putRecord" as never, {
      input: { repo: this.did, collection, rkey, record: { ...record, $type: collection } },
    } as never);
    if (!res.ok) throw new RockskyError(res.data);
    return (res.data as { uri: string }).uri;
  }

  /** Delete a record by collection + rkey. */
  async delete(collection: string, rkey: string): Promise<void> {
    const res = await this.rpc.post("com.atproto.repo.deleteRecord" as never, {
      input: { repo: this.did, collection, rkey },
    } as never);
    if (!res.ok) throw new RockskyError(res.data);
  }

  /** Scrobble a play (app.rocksky.scrobble). createdAt defaults to now. */
  async scrobble(rec: ScrobbleInput): Promise<string> {
    const record = { ...rec, createdAt: rec.createdAt || nowISO() };
    if (this.idx) {
      const secs = Math.floor(Date.parse(record.createdAt) / 1000);
      const existing = await this.idx.scrobbleUri(this.did, record.title!, record.artist!, record.album!, secs);
      if (existing) return existing;
    }
    const uri = await this.create(C_SCROBBLE, record as Record<string, unknown>);
    if (this.idx) {
      const secs = Math.floor(Date.parse(record.createdAt) / 1000);
      await this.idx.recordScrobble(this.did, record.title!, record.artist!, record.album!, secs, uri);
    }
    return uri;
  }

  /** Scrobble from just a title + artist (album optional, plus optional
   * `mbId`/`isrc` anchors): resolve full metadata via `matchSong`, then write.
   * Matching uses the public AppView unless `appview` is given; an empty match
   * falls back to a minimal record. */
  async scrobbleMatch(
    title: string,
    artist: string,
    album?: string,
    mbId?: string,
    isrc?: string,
    appview?: string,
  ): Promise<string> {
    const { RockskyClient } = await import("./client.js");
    const m = (await new RockskyClient(appview).matchSong(title, artist, mbId, isrc)) as Record<
      string,
      unknown
    > | null;
    const s = (k: string): string | undefined => (m && typeof m[k] === "string" ? (m[k] as string) : undefined);
    const n = (k: string): number | undefined => (m && typeof m[k] === "number" ? (m[k] as number) : undefined);
    const rec: ScrobbleInput =
      m && m.title
        ? {
            title: s("title")!,
            artist: s("artist")!,
            albumArtist: s("albumArtist") ?? artist,
            album: album ?? s("album") ?? "",
            albumArtUrl: s("albumArt"),
            duration: n("duration") ?? 0,
            trackNumber: n("trackNumber"),
            discNumber: n("discNumber"),
            year: n("year"),
            releaseDate: s("releaseDate"),
            genre: s("genre"),
            composer: s("composer"),
            label: s("label"),
            mbid: s("mbId"),
            isrc: s("isrc"),
            spotifyLink: s("spotifyLink"),
            youtubeLink: s("youtubeLink"),
            tidalLink: s("tidalLink"),
            appleMusicLink: s("appleMusicLink"),
          }
        : { title, artist, album: album ?? "", albumArtist: artist, duration: 0 };
    return this.scrobble(rec);
  }

  /** Create a canonical track record (app.rocksky.song). */
  async createSong(rec: SongInput): Promise<string> {
    const record = { ...rec, createdAt: rec.createdAt || nowISO() };
    if (this.idx) {
      const existing = await this.idx.songUri(this.did, record.title!, record.artist!, record.album!);
      if (existing) return existing;
    }
    const uri = await this.create(C_SONG, record as Record<string, unknown>);
    if (this.idx) await this.idx.recordSong(this.did, record.title!, record.artist!, record.album!, uri);
    return uri;
  }

  /** Create an album record (app.rocksky.album). `artist` is the album artist. */
  async createAlbum(rec: AlbumInput): Promise<string> {
    const record = { ...rec, createdAt: rec.createdAt || nowISO() };
    if (this.idx) {
      const existing = await this.idx.albumUri(this.did, record.title!, record.artist!);
      if (existing) return existing;
    }
    const uri = await this.create(C_ALBUM, record as Record<string, unknown>);
    if (this.idx) await this.idx.recordAlbum(this.did, record.title!, record.artist!, uri);
    return uri;
  }

  /** Create an artist record (app.rocksky.artist). */
  async createArtist(rec: ArtistInput): Promise<string> {
    const record = { ...rec, createdAt: rec.createdAt || nowISO() };
    if (this.idx) {
      const existing = await this.idx.artistUri(this.did, record.name!);
      if (existing) return existing;
    }
    const uri = await this.create(C_ARTIST, record as Record<string, unknown>);
    if (this.idx) await this.idx.recordArtist(this.did, record.name!, uri);
    return uri;
  }

  /** Like a record by strong reference (uri + cid). Returns the like URI. */
  like(uri: string, cid: string): Promise<string> {
    return this.create(C_LIKE, { subject: { uri, cid }, createdAt: nowISO() });
  }

  /** Follow an account by DID. Returns the follow URI. */
  follow(did: string): Promise<string> {
    return this.create(C_FOLLOW, { subject: did, createdAt: nowISO() });
  }

  /** Post a shout on a subject. Returns the shout URI. */
  shout(subjectUri: string, subjectCid: string, message: string): Promise<string> {
    return this.create(C_SHOUT, { subject: { uri: subjectUri, cid: subjectCid }, message, createdAt: nowISO() });
  }

  /** Reply to a shout, with a parent strong-ref. */
  replyShout(
    subjectUri: string,
    subjectCid: string,
    parentUri: string,
    parentCid: string,
    message: string,
  ): Promise<string> {
    return this.create(C_SHOUT, {
      subject: { uri: subjectUri, cid: subjectCid },
      parent: { uri: parentUri, cid: parentCid },
      message,
      createdAt: nowISO(),
    });
  }

  /** Upsert the actor's now-playing status singleton (rkey "self"). */
  setNowPlaying(track: ActorTrackView): Promise<string> {
    return this.putRecord(C_STATUS, "self", { track, startedAt: nowISO() });
  }

  /** Delete the actor's now-playing status singleton. */
  clearNowPlaying(): Promise<void> {
    return this.delete(C_STATUS, "self");
  }
}
