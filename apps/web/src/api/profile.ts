import type {
  ScrobbleViewBasic,
  StatsGlobalStatsView,
  StatsView,
} from "@rocksky/sdk";
import { Compatibility } from "../types/compatibility";
import { Neighbour } from "../types/neighbour";
import { Profile } from "../types/profile";
import { rocksky } from "../lib/rocksky";

// app.rocksky.actor.getProfile — the live AppView response carries the
// spotify/googledrive/dropbox account fields on top of the lexicon view,
// which the local Profile type describes.
export const getProfileByDid = async (did: string): Promise<Profile> => {
  return (await rocksky().get("app.rocksky.actor.getProfile", {
    did,
  })) as Profile;
};

export const getProfileStatsByDid = async (did: string): Promise<StatsView> => {
  return rocksky().stats(did);
};

export const getGlobalStats = async (): Promise<StatsGlobalStatsView> => {
  return rocksky().globalStats();
};

export const getRecentTracksByDid = async (
  did: string,
  offset = 0,
  limit = 10,
): Promise<ScrobbleViewBasic[]> => {
  return rocksky().scrobbles(did, limit, offset);
};

// app.rocksky.actor.getActorNeighbours — the local Neighbour type describes
// the live response, which always fills the profile and shared-artist fields
// (the lexicon view marks everything optional).
export const getActorNeighbours = async (
  did: string,
): Promise<{ neighbours: Neighbour[] }> => {
  return (await rocksky().get("app.rocksky.actor.getActorNeighbours", {
    did,
  })) as { neighbours: Neighbour[] };
};

// app.rocksky.actor.getActorCompatibility — the local Compatibility type
// describes the live response (topSharedArtists + per-artist ranks/weights),
// which diverges from the lexicon compatibility view.
export const getActorCompatibility = async (
  did: string,
): Promise<{ compatibility: Compatibility | null }> => {
  return (await rocksky().get("app.rocksky.actor.getActorCompatibility", {
    did,
  })) as { compatibility: Compatibility | null };
};
