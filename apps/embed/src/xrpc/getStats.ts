import { ROCKSKY_API_URL } from "../consts";
import type { ProfileStats } from "../types/stats";

export default async function getProfileStats(handle: string) {
  const res = await fetch(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.stats.getStats?did=${handle}`,
  );
  const stats = (await res.json()) as ProfileStats;

  return { stats, ok: res.ok };
}
