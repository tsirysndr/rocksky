/* eslint-disable @typescript-eslint/no-explicit-any */
// These functions previously returned untyped axios `response.data`; the
// `any` returns preserve that contract for existing consumers.
import { rocksky } from "../lib/rocksky";

export const getProfileByDid = async (did: string): Promise<any> => {
  return rocksky().profile(did);
};

export const getProfileStatsByDid = async (did: string): Promise<any> => {
  return rocksky().stats(did);
};

export const getRecentTracksByDid = async (
  did: string,
  offset = 0,
  limit = 10,
): Promise<any[]> => {
  return rocksky().scrobbles(did, limit, offset);
};

export const getActorNeighbours = async (did: string): Promise<any> => {
  return rocksky().neighbours(did);
};
