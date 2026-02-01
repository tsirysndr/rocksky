import { ROCKSKY_API_URL } from "../consts";
import type { Profile } from "../types/profile";

export default async function getProfile(handle: string) {
  const res = await fetch(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.actor.getProfile?did=${handle}`,
  );

  const profile = (await res.json()) as Profile;

  return { profile, ok: res.ok };
}
