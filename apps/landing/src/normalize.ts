import type { ScrobbleViewBasic } from "@rocksky/sdk";

// The production AppView still returns these aliases alongside newer fields.
// Normalize at the boundary so components can use the SDK's public model.
export function normalizeScrobble(track: ScrobbleViewBasic): ScrobbleViewBasic {
  const legacy = track as ScrobbleViewBasic & {
    cover?: string;
    user?: string;
    userAvatar?: string;
    date?: string;
  };
  return {
    ...track,
    albumArt: track.albumArt || legacy.cover,
    handle: track.handle || legacy.user,
    avatar: track.avatar || legacy.userAvatar,
    createdAt: track.createdAt || legacy.date,
  };
}
