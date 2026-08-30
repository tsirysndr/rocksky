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
  ShoutGif,
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

/** Lower-case hostname of a URL, or "" if it can't be parsed. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// --- PDS write-rate limiting -----------------------------------------------
// Bluesky's PDS rate-limits repo writes by *points*, not requests: ~5,000
// points/hour per account, and each createRecord/putRecord/deleteRecord costs
// ~3 points. A bulk operation (importing a listening history) would blow that
// budget in seconds, so the Agent can throttle its own writes to stay inside
// it. The gate is OFF by default — single live scrobbles never need it — and
// callers opt in via {@link Agent.configureRateLimit}.
const PDS_WRITE_POINT_BUDGET_PER_HOUR = 5_000;
const POINTS_PER_WRITE = 3;
const SAFETY_MARGIN = 0.9; // headroom for 429 retries / clock skew

/**
 * The highest sustained writes-per-hour that still fits Bluesky's write-point
 * budget. On the official Bluesky PDS this is a hard ceiling the Agent will not
 * let any caller exceed; self-hosted PDSes may allow more (or none).
 */
export const MAX_SAFE_WRITES_PER_HOUR = Math.floor(
  (PDS_WRITE_POINT_BUDGET_PER_HOUR * SAFETY_MARGIN) / POINTS_PER_WRITE,
);

// Rocksky's AppView `matchSong` endpoint is a *shared* service, and unlike PDS
// writes its rate limit is NOT the account owner's to waive — running your own
// PDS grants no extra AppView capacity. So matchSong is ALWAYS throttled,
// independent of the write throttle and of any `disabled` request.
//
// The AppView applies a global per-IP XRPC limit (see apps/api/src/index.ts:
// 1000 requests / 30s). matchSong runs against exactly that budget, so we throttle
// it to a safe fraction of the real server limit. Tune via `matchSongPerHour` if
// you operate your own AppView with a different limit.
const APPVIEW_REQUEST_LIMIT = 1_000; // requests …
const APPVIEW_WINDOW_SECONDS = 30; // … per this window (apps/api global rate limiter)
export const DEFAULT_MATCH_SONG_PER_HOUR = Math.floor(
  ((APPVIEW_REQUEST_LIMIT * SAFETY_MARGIN) / APPVIEW_WINDOW_SECONDS) * 3_600,
); // ≈ 108,000/h (~30 req/s) — 90% of the AppView's per-IP budget

/** Options for {@link Agent.configureRateLimit}. */
export interface RateLimitOptions {
  /**
   * Target writes (createRecord/putRecord/deleteRecord) per hour. Omitted →
   * {@link MAX_SAFE_WRITES_PER_HOUR}. On the official Bluesky PDS this is
   * clamped to the safe ceiling; on a self-hosted PDS it is honored as given.
   * Ignored when `disabled` is true.
   */
  writesPerHour?: number;
  /**
   * Turn the client-side *write* throttle off entirely. Honored on self-hosted
   * PDSes (useful when you run your own PDS with its own limits). IGNORED —
   * forced back on at the safe rate — when the account lives on the official
   * Bluesky PDS (*.bsky.network), whose budget is enforced server-side.
   *
   * NOTE: this never affects the Rocksky AppView `matchSong` throttle, which is
   * always enforced (see {@link RateLimitOptions.matchSongPerHour}).
   */
  disabled?: boolean;
  /**
   * Target Rocksky AppView `matchSong` calls per hour. ALWAYS enforced — a
   * self-hosted PDS grants no extra AppView capacity — so `disabled` never turns
   * it off; this only tunes the rate. Omitted → keep the current value
   * (default {@link DEFAULT_MATCH_SONG_PER_HOUR}). Non-positive values are ignored.
   */
  matchSongPerHour?: number;
}

/** The effective throttle state after {@link Agent.configureRateLimit} applies policy. */
export interface RateLimitState {
  /** Whether the *write* throttle is active. */
  enabled: boolean;
  /** Effective writes/hour cap (Infinity when disabled). */
  writesPerHour: number;
  /** True when `disabled` was requested but overridden by the bsky.network guard. */
  forcedOn: boolean;
  /** True when a requested `writesPerHour` was clamped to the safe ceiling. */
  capped: boolean;
  /** The resolved PDS host the decision was based on. */
  pdsHost: string;
  /** Effective Rocksky AppView matchSong rate — always enforced, never disabled. */
  matchSongPerHour: number;
}

/**
 * Global throttle: spaces calls at least `minIntervalMs` apart. A single shared
 * `nextAt` cursor is advanced atomically per {@link RateGate.take}, so even
 * highly concurrent callers never burst past the configured rate.
 * `minIntervalMs <= 0` means no throttle (take() resolves immediately).
 */
class RateGate {
  private nextAt = 0;
  private minIntervalMs = 0;

  /** null / non-positive → no throttle. */
  setRate(writesPerHour: number | null): void {
    this.minIntervalMs =
      writesPerHour && writesPerHour > 0 ? Math.ceil(3_600_000 / writesPerHour) : 0;
  }

  async take(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.minIntervalMs;
    const delay = at - now;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
}

// Write inputs: `createdAt` is optional (the SDK defaults it to now).
/** Input for {@link Agent.scrobble} (createdAt defaults to now). */
export type ScrobbleInput = Omit<ScrobbleRecord, "createdAt"> & { createdAt?: string };
/** Input for {@link Agent.scrobbleMatch} — `title`/`artist` required, rest optional. */
export interface ScrobbleMatchInput {
  title: string;
  artist: string;
  /** Overrides the matched album. */
  album?: string;
  /** MusicBrainz recording id — anchors the match. */
  mbId?: string;
  /** ISRC — anchors the match. */
  isrc?: string;
  /** Scrobbled-at Unix seconds; omitted = now. */
  timestamp?: number;
}
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
  // PDS write throttle — off by default: single live scrobbles don't need it. An
  // import (or any bulk writer) opts in via configureRateLimit().
  private writeGate = new RateGate();
  // Rocksky AppView matchSong throttle — ALWAYS on. A self-hosted PDS grants no
  // extra AppView capacity, so this is never disabled, only tuned.
  private matchGate = new RateGate();
  private matchSongPerHour = DEFAULT_MATCH_SONG_PER_HOUR;

  /** Lower-case hostname of the account's resolved PDS (e.g. "pds.example.com"). */
  readonly pdsHost: string;

  private constructor(
    private rpc: Client,
    readonly did: string,
    readonly session: PasswordSession,
    private pds: string,
  ) {
    this.pdsHost = hostOf(pds);
    this.matchGate.setRate(this.matchSongPerHour);
  }

  /**
   * Whether the account lives on the official Bluesky PDS (*.bsky.network).
   * Its write budget is enforced server-side, so the client-side throttle can
   * never be disabled for these hosts.
   */
  get isOfficialBlueskyPds(): boolean {
    return this.pdsHost === "bsky.network" || this.pdsHost.endsWith(".bsky.network");
  }

  /**
   * Configure the client-side write throttle and return the effective state.
   *
   * Policy — the *.bsky.network guard is authoritative and cannot be bypassed:
   *  - `disabled: true` turns the throttle off on a self-hosted PDS, but on the
   *    official Bluesky PDS it is ignored and the throttle stays on at the safe
   *    rate (`forcedOn: true`).
   *  - `writesPerHour` is honored as given on a self-hosted PDS, but clamped to
   *    {@link MAX_SAFE_WRITES_PER_HOUR} on the official Bluesky PDS
   *    (`capped: true` when clamped).
   *  - Omitting both enables the throttle at the safe default rate.
   */
  configureRateLimit(opts: RateLimitOptions = {}): RateLimitState {
    // matchSong throttle is always enforced — `disabled` never touches it. A
    // positive `matchSongPerHour` retunes it; anything else keeps the current rate.
    if (opts.matchSongPerHour !== undefined && opts.matchSongPerHour > 0) {
      this.matchSongPerHour = opts.matchSongPerHour;
      this.matchGate.setRate(this.matchSongPerHour);
    }

    const official = this.isOfficialBlueskyPds;
    const state = (partial: Omit<RateLimitState, "pdsHost" | "matchSongPerHour">): RateLimitState => ({
      ...partial,
      pdsHost: this.pdsHost,
      matchSongPerHour: this.matchSongPerHour,
    });

    if (opts.disabled) {
      if (official) {
        // Guard: never let the write throttle be turned off on the official
        // Bluesky PDS — that only earns 429s and risks account-level throttling.
        const writesPerHour = Math.min(
          opts.writesPerHour ?? MAX_SAFE_WRITES_PER_HOUR,
          MAX_SAFE_WRITES_PER_HOUR,
        );
        this.writeGate.setRate(writesPerHour);
        return state({ enabled: true, writesPerHour, forcedOn: true, capped: false });
      }
      this.writeGate.setRate(null);
      return state({ enabled: false, writesPerHour: Infinity, forcedOn: false, capped: false });
    }

    let writesPerHour = opts.writesPerHour ?? MAX_SAFE_WRITES_PER_HOUR;
    if (!(writesPerHour > 0)) writesPerHour = MAX_SAFE_WRITES_PER_HOUR; // reject 0 / NaN / negatives
    let capped = false;
    if (official && writesPerHour > MAX_SAFE_WRITES_PER_HOUR) {
      writesPerHour = MAX_SAFE_WRITES_PER_HOUR;
      capped = true;
    }
    this.writeGate.setRate(writesPerHour);
    return state({ enabled: true, writesPerHour, forcedOn: false, capped });
  }

  /**
   * Resolve the account's PDS, authenticate with an app password, and return an
   * Agent. `identifier` is a handle or DID.
   */
  static async login(identifier: string, password: string): Promise<Agent> {
    const actor = await actorResolver().resolve(identifier as never);
    // The resolver may hand back a PDS URL with a trailing slash; strip it so
    // callers that build `${pds}/xrpc/...` don't produce a `//xrpc` path (which
    // some PDS hosts answer with 404).
    const pds = actor.pds.replace(/\/+$/, "");
    const session = await PasswordSession.login({ service: pds, identifier, password });
    return new Agent(new Client({ handler: session }), session.did, session, pds);
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
    await this.writeGate.take();
    const res = await this.rpc.post("com.atproto.repo.createRecord" as never, {
      input: { repo: this.did, collection, record: { ...record, $type: collection } },
    } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
    return (res.data as { uri: string }).uri;
  }

  private async putRecord(collection: string, rkey: string, record: Record<string, unknown>): Promise<string> {
    await this.writeGate.take();
    const res = await this.rpc.post("com.atproto.repo.putRecord" as never, {
      input: { repo: this.did, collection, rkey, record: { ...record, $type: collection } },
    } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
    return (res.data as { uri: string }).uri;
  }

  /** Delete a record by collection + rkey. */
  async delete(collection: string, rkey: string): Promise<void> {
    await this.writeGate.take();
    const res = await this.rpc.post("com.atproto.repo.deleteRecord" as never, {
      input: { repo: this.did, collection, rkey },
    } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
  }

  /**
   * Scrobble a play (app.rocksky.scrobble). Before writing the scrobble, this
   * publishes the canonical metadata it implies — artist, then album, then song
   * (in that dependency order) — so the play is self-contained in the user's
   * PDS. Every write is deduplicated against the attached index: anything
   * already present in the repo is skipped, never republished. createdAt
   * defaults to now.
   */
  async scrobble(rec: ScrobbleInput): Promise<string> {
    const record = { ...rec, createdAt: rec.createdAt || nowISO() };
    // Materialize artist -> album -> song first (deduped). Then the scrobble.
    await this.publishScrobbleMetadata(record);
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

  /**
   * Publish the artist/album/song records a scrobble implies, in dependency
   * order, each deduplicated via {@link Agent.createArtist}/`createAlbum`/
   * `createSong`. A record is written only when its identity fields are
   * present — artist needs an album artist, album needs title + artist, song
   * needs title + artist + album — because a record without a stable identity
   * hash cannot be deduped and would be republished on every scrobble.
   */
  private async publishScrobbleMetadata(record: ScrobbleInput & { createdAt: string }): Promise<void> {
    const { albumArtist, album, title, artist, createdAt } = record;
    if (albumArtist) {
      await this.createArtist({ name: albumArtist, createdAt });
    }
    if (albumArtist && album) {
      await this.createAlbum({
        title: album,
        artist: albumArtist,
        releaseDate: record.releaseDate,
        year: record.year,
        genre: record.genre,
        albumArtUrl: record.albumArtUrl,
        tags: record.tags,
        youtubeLink: record.youtubeLink,
        spotifyLink: record.spotifyLink,
        tidalLink: record.tidalLink,
        appleMusicLink: record.appleMusicLink,
        createdAt,
      });
    }
    if (title && artist && album) {
      // A song record shares the scrobble's shape verbatim.
      await this.createSong({ ...record });
    }
  }

  /** Scrobble from just a title + artist (album optional, plus optional
   * `mbId`/`isrc` anchors): resolve full metadata via `matchSong`, then write.
   * Matching uses the public AppView unless `appview` is given; an empty match
   * falls back to a minimal record. Delegates to {@link Agent.scrobble}, so it
   * publishes the implied artist/album/song (deduped) before the scrobble. */
  async scrobbleMatch(input: ScrobbleMatchInput, appview?: string): Promise<string> {
    const { title, artist, album, mbId, isrc, timestamp } = input;
    const { RockskyClient } = await import("./client.js");
    // matchSong hits the shared Rocksky AppView; always throttle it, regardless
    // of the write-throttle policy (a self-hosted PDS grants no AppView capacity).
    await this.matchGate.take();
    const m = (await new RockskyClient(appview).matchSong(title, artist, mbId, isrc, album)) as Record<
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
    // "Scrobbled at" — Unix seconds; omitted -> scrobble() defaults to now.
    if (timestamp !== undefined) rec.createdAt = new Date(timestamp * 1000).toISOString();
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

  /** Post a shout on a subject. Returns the shout URI. Pass at least one of
   * `message` / `gif` — `message` may be omitted when a GIF/sticker/clip is
   * attached. */
  shout(subjectUri: string, subjectCid: string, message?: string, gif?: ShoutGif): Promise<string> {
    return this.create(C_SHOUT, {
      subject: { uri: subjectUri, cid: subjectCid },
      ...(message !== undefined ? { message } : {}),
      ...(gif ? { gif } : {}),
      createdAt: nowISO(),
    });
  }

  /** Reply to a shout, with a parent strong-ref. Pass at least one of `message`
   * / `gif` — `message` may be omitted when a GIF/sticker/clip is attached. */
  replyShout(
    subjectUri: string,
    subjectCid: string,
    parentUri: string,
    parentCid: string,
    message?: string,
    gif?: ShoutGif,
  ): Promise<string> {
    return this.create(C_SHOUT, {
      subject: { uri: subjectUri, cid: subjectCid },
      parent: { uri: parentUri, cid: parentCid },
      ...(message !== undefined ? { message } : {}),
      ...(gif ? { gif } : {}),
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
