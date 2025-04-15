#!/usr/bin/env node

export const ROCKSKY_API_URL = "https://api.rocksky.app";

export class RockskyClient {
  constructor(private readonly token: string) {
    if (!token) {
      throw new Error("Token is required to create a RockskyClient instance.");
    }
    this.token = token;
  }

  async getCurrentUser() {
    const response = await fetch(`${ROCKSKY_API_URL}/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
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
          Authorization: `Bearer ${this.token}`,
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
          Authorization: `Bearer ${this.token}`,
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
}
