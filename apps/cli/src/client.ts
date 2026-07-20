import fs from "fs";
import os from "os";
import path from "path";

export const ROCKSKY_API_URL = "https://api.rocksky.app";

interface ActorRangeOpts {
  skip?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export class RockskyClient {
  constructor(private readonly token?: string) {
    this.token = token;
  }

  async getCurrentUser() {
    const response = await fetch(`${ROCKSKY_API_URL}/profile`, {
      method: "GET",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.statusText}`);
    }

    return response.json();
  }

  async getSpotifyNowPlaying(did?: string) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/spotify/currently-playing` +
        (did ? `?did=${did}` : ""),
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch now playing data: ${response.statusText}`,
      );
    }

    return response.json();
  }

  async getNowPlaying(did?: string) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/now-playing` + (did ? `?did=${did}` : ""),
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch now playing data: ${response.statusText}`,
      );
    }

    return response.json();
  }

  async scrobbles(did?: string, { skip = 0, limit = 20 } = {}) {
    if (did) {
      const response = await fetch(
        `${ROCKSKY_API_URL}/users/${did}/scrobbles?offset=${skip}&size=${limit}`,
        {
          method: "GET",
          headers: {
            Authorization: this.token ? `Bearer ${this.token}` : undefined,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch scrobbles data: ${response.statusText}`,
        );
      }
      return response.json();
    }

    const response = await fetch(
      `${ROCKSKY_API_URL}/public/scrobbles?offset=${skip}&size=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch scrobbles data: ${response.statusText}`);
    }

    return response.json();
  }

  async search(query: string, { size }) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/xrpc/app.rocksky.feed.search?query=${query}&size=${size}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch search data: ${response.statusText}`);
    }

    return response.json();
  }

  async stats(did?: string) {
    if (!did) {
      const didFile = path.join(os.homedir(), ".rocksky", "did");
      try {
        await fs.promises.access(didFile);
        did = await fs.promises.readFile(didFile, "utf-8");
      } catch (err) {
        const user = await this.getCurrentUser();
        did = user.did;
        const didPath = path.join(os.homedir(), ".rocksky");
        fs.promises.mkdir(didPath, { recursive: true });
        await fs.promises.writeFile(didFile, did);
      }
    }

    const response = await fetch(`${ROCKSKY_API_URL}/users/${did}/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch stats data: ${response.statusText}`);
    }

    return response.json();
  }

  async getArtists(did?: string, { skip = 0, limit = 20 } = {}) {
    if (!did) {
      const didFile = path.join(os.homedir(), ".rocksky", "did");
      try {
        await fs.promises.access(didFile);
        did = await fs.promises.readFile(didFile, "utf-8");
      } catch (err) {
        const user = await this.getCurrentUser();
        did = user.did;
        const didPath = path.join(os.homedir(), ".rocksky");
        fs.promises.mkdir(didPath, { recursive: true });
        await fs.promises.writeFile(didFile, did);
      }
    }

    const response = await fetch(
      `${ROCKSKY_API_URL}/users/${did}/artists?offset=${skip}&size=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch artists data: ${response.statusText}`);
    }
    return response.json();
  }

  async getAlbums(did?: string, { skip = 0, limit = 20 } = {}) {
    if (!did) {
      const didFile = path.join(os.homedir(), ".rocksky", "did");
      try {
        await fs.promises.access(didFile);
        did = await fs.promises.readFile(didFile, "utf-8");
      } catch (err) {
        const user = await this.getCurrentUser();
        did = user.did;
        const didPath = path.join(os.homedir(), ".rocksky");
        fs.promises.mkdir(didPath, { recursive: true });
        await fs.promises.writeFile(didFile, did);
      }
    }

    const response = await fetch(
      `${ROCKSKY_API_URL}/users/${did}/albums?offset=${skip}&size=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch albums data: ${response.statusText}`);
    }
    return response.json();
  }

  async getTracks(did?: string, { skip = 0, limit = 20 } = {}) {
    if (!did) {
      const didFile = path.join(os.homedir(), ".rocksky", "did");
      try {
        await fs.promises.access(didFile);
        did = await fs.promises.readFile(didFile, "utf-8");
      } catch (err) {
        const user = await this.getCurrentUser();
        did = user.did;
        const didPath = path.join(os.homedir(), ".rocksky");
        fs.promises.mkdir(didPath, { recursive: true });
        await fs.promises.writeFile(didFile, did);
      }
    }

    const response = await fetch(
      `${ROCKSKY_API_URL}/users/${did}/tracks?offset=${skip}&size=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch tracks data: ${response.statusText}`);
    }
    return response.json();
  }

  async scrobble(api_key, api_sig, track, artist, timestamp) {
    const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
    try {
      await fs.promises.access(tokenPath);
    } catch (err) {
      console.error(
        `You are not logged in. Please run the login command first.`,
      );
      return;
    }
    const tokenData = await fs.promises.readFile(tokenPath, "utf-8");
    const { token: sk } = JSON.parse(tokenData);
    const response = await fetch("https://audioscrobbler.rocksky.app/2.0", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        method: "track.scrobble",
        "track[0]": track,
        "artist[0]": artist,
        "timestamp[0]": timestamp || Math.floor(Date.now() / 1000),
        api_key,
        api_sig,
        sk,
        format: "json",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to scrobble track: ${
          response.statusText
        } ${await response.text()}`,
      );
    }

    return response.json();
  }

  async getApiKeys() {
    const response = await fetch(`${ROCKSKY_API_URL}/apikeys`, {
      method: "GET",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch API keys: ${response.statusText}`);
    }

    return response.json();
  }

  async createApiKey(name: string, description?: string) {
    const response = await fetch(`${ROCKSKY_API_URL}/apikeys`, {
      method: "POST",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create API key: ${response.statusText}`);
    }

    return response.json();
  }

  // Paginated list of the authenticated user's uploaded tracks. Each row is
  // `{ upload, track, ... }`; `upload.id` is what streams via `streamUrl`.
  // Optionally filtered to a single album (by `albumUri`, or `albumArtist` +
  // `albumName`).
  async getUploads({
    skip = 0,
    limit = 50,
    albumUri,
    albumArtist,
    albumName,
    q,
  }: {
    skip?: number;
    limit?: number;
    albumUri?: string;
    albumArtist?: string;
    albumName?: string;
    q?: string;
  } = {}) {
    const params = new URLSearchParams({
      offset: String(skip),
      size: String(limit),
    });
    if (albumUri) params.set("albumUri", albumUri);
    if (albumArtist) params.set("albumArtist", albumArtist);
    if (albumName) params.set("albumName", albumName);
    if (q) params.set("q", q);

    const response = await fetch(`${ROCKSKY_API_URL}/uploads?${params}`, {
      method: "GET",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch uploads: ${response.statusText}`);
    }
    return response.json();
  }

  // Delete a single uploaded track (by its track id).
  async deleteUploadByTrack(trackId: string) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/uploads/by-track/${trackId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to delete track: ${response.statusText}`);
    }
    return response.json().catch(() => ({}));
  }

  // Delete all uploaded tracks of an album (by albumUri, or albumArtist+name).
  async deleteUploadAlbum(params: {
    albumUri?: string;
    albumArtist?: string;
    albumName?: string;
  }) {
    const qs = new URLSearchParams();
    if (params.albumUri) qs.set("albumUri", params.albumUri);
    if (params.albumArtist) qs.set("albumArtist", params.albumArtist);
    if (params.albumName) qs.set("albumName", params.albumName);
    const response = await fetch(`${ROCKSKY_API_URL}/uploads/album?${qs}`, {
      method: "DELETE",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to delete album: ${response.statusText}`);
    }
    return response.json().catch(() => ({}));
  }

  // Distinct albums the user has uploaded tracks for.
  async getUploadAlbums({ skip = 0, limit = 200 } = {}) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/uploads/albums?offset=${skip}&size=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch upload albums: ${response.statusText}`);
    }
    return response.json();
  }

  // Distinct album artists the user has uploaded tracks for.
  async getUploadArtists({ skip = 0, limit = 200 } = {}) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/uploads/artists?offset=${skip}&size=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch upload artists: ${response.statusText}`);
    }
    return response.json();
  }

  // Short-lived opaque token for use as `?token=` in stream URLs (the native
  // player can't set an Authorization header). Returns `{ token, expiresIn }`.
  async getStreamToken(): Promise<{ token: string; expiresIn: number }> {
    const response = await fetch(`${ROCKSKY_API_URL}/uploads/stream-token`, {
      method: "GET",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to get stream token: ${response.statusText}`);
    }
    return response.json();
  }

  // A range-capable audio URL the rockbox player can stream directly.
  streamUrl(uploadId: string, streamToken: string) {
    return `${ROCKSKY_API_URL}/uploads/${uploadId}/stream?token=${streamToken}`;
  }

  // Submit a scrobble / now-playing update for the authenticated user. The
  // server applies its own dedup + abuse rules and publishes the AT record.
  async scrobbleNowPlaying(track: {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    duration: number;
    albumArt?: string;
    timestamp?: number;
  }) {
    const response = await fetch(`${ROCKSKY_API_URL}/now-playing`, {
      method: "POST",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(track),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to scrobble: ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  }

  // --- xrpc data endpoints --------------------------------------------------
  private async xrpc(method: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params);
    const response = await fetch(
      `${ROCKSKY_API_URL}/xrpc/${method}?${qs}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`${method} failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Global recent scrobbles (all users).
  async getGlobalScrobbles({ skip = 0, limit = 20 } = {}) {
    const data = await this.xrpc("app.rocksky.scrobble.getScrobbles", {
      offset: String(skip),
      limit: String(limit),
    });
    return data.scrobbles || [];
  }

  async getActorScrobbles(did: string, { skip = 0, limit = 20 } = {}) {
    const data = await this.xrpc("app.rocksky.actor.getActorScrobbles", {
      did,
      offset: String(skip),
      limit: String(limit),
    });
    return data.scrobbles || [];
  }

  async getActorSongs(
    did: string,
    { skip = 0, limit = 20, startDate, endDate }: ActorRangeOpts = {},
  ) {
    const data = await this.xrpc("app.rocksky.actor.getActorSongs", {
      did,
      offset: String(skip),
      limit: String(limit),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    return data.tracks || [];
  }

  // User listening stats via xrpc (the REST /users/:did/stats route 500s).
  async getStats(did: string) {
    return this.xrpc("app.rocksky.stats.getStats", { did });
  }

  // --- likes (xrpc) ---------------------------------------------------------
  private async xrpcPost(method: string, body: unknown) {
    const response = await fetch(`${ROCKSKY_API_URL}/xrpc/${method}`, {
      method: "POST",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${method} failed: ${response.status}`);
    }
    return response.json().catch(() => ({}));
  }

  likeSong(uri: string) {
    return this.xrpcPost("app.rocksky.like.likeSong", { uri });
  }

  dislikeSong(uri: string) {
    return this.xrpcPost("app.rocksky.like.dislikeSong", { uri });
  }

  // The user's loved songs (each track carries its song `uri`).
  async getLovedSongs(did: string, { skip = 0, limit = 500 } = {}) {
    const data = await this.xrpc("app.rocksky.actor.getActorLovedSongs", {
      did,
      offset: String(skip),
      limit: String(limit),
    });
    return data.tracks || [];
  }

  async getActorArtists(
    did: string,
    { skip = 0, limit = 20, startDate, endDate }: ActorRangeOpts = {},
  ) {
    const data = await this.xrpc("app.rocksky.actor.getActorArtists", {
      did,
      offset: String(skip),
      limit: String(limit),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    return data.artists || [];
  }

  async getActorAlbums(
    did: string,
    { skip = 0, limit = 20, startDate, endDate }: ActorRangeOpts = {},
  ) {
    const data = await this.xrpc("app.rocksky.actor.getActorAlbums", {
      did,
      offset: String(skip),
      limit: String(limit),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    return data.albums || [];
  }

  async matchSong(title: string, artist: string) {
    const q = new URLSearchParams({
      title,
      artist,
    });
    const response = await fetch(
      `${ROCKSKY_API_URL}/xrpc/app.rocksky.song.matchSong?${q.toString()}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to match song: ${response.statusText} ${await response.text()}`,
      );
    }

    return response.json();
  }
}
