import fs from "fs";
import os from "os";
import path from "path";

export const ROCKSKY_API_URL = "https://api.rocksky.app";

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
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch now playing data: ${response.statusText}`
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
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch now playing data: ${response.statusText}`
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
        }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch scrobbles data: ${response.statusText}`
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
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch scrobbles data: ${response.statusText}`);
    }

    return response.json();
  }

  async search(query: string, { size }) {
    const response = await fetch(
      `${ROCKSKY_API_URL}/search?q=${query}&size=${size}`,
      {
        method: "GET",
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
          "Content-Type": "application/json",
        },
      }
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
      }
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
      }
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
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch tracks data: ${response.statusText}`);
    }
    return response.json();
  }
}
