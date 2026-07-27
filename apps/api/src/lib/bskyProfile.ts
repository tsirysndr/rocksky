import { type Agent, AtpAgent } from "@atproto/api";
import { consola } from "consola";
import _ from "lodash";

// Resolved public profile fields. A field is `undefined` when neither the
// AppView nor the PDS provided it, so callers can preserve existing good data
// instead of overwriting it with an empty value.
export type ResolvedBskyProfile = {
  avatar?: string;
  displayName?: string;
};

// Shared, unauthenticated client for the Bluesky public AppView. The AppView is
// globally reachable and purpose-built for public reads, so it never geo/IP
// blocks our egress the way a self-hosted PDS can (see caramelo.social.br
// dropping traffic from our Contabo VPS).
const appViewAgent = new AtpAgent({ service: "https://public.api.bsky.app" });

/**
 * Resolve a user's avatar + displayName, preferring the Bluesky public AppView
 * (returns a ready-made avatar CDN URL and never blocks our egress). Falls back
 * to reading the profile record straight from the user's PDS via `agent` only
 * when the AppView lookup fails entirely.
 */
export async function fetchBskyProfile(
  did: string | undefined,
  agent?: Agent | AtpAgent,
): Promise<ResolvedBskyProfile> {
  if (!did) {
    return {};
  }

  // Primary: public AppView.
  try {
    const { data } = await appViewAgent.app.bsky.actor.getProfile({
      actor: did,
    });
    return {
      avatar: data.avatar || undefined,
      displayName: data.displayName || undefined,
    };
  } catch (error) {
    consola.warn(
      `AppView getProfile failed for ${did}; falling back to PDS:`,
      error,
    );
  }

  // Fallback: read the profile record directly from the user's PDS. This only
  // succeeds when our egress can actually reach the PDS.
  try {
    if (agent) {
      const { data } = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: "app.bsky.actor.profile",
        rkey: "self",
      });
      const ref = _.get(data, "value.avatar.ref") as
        | { toString(): string }
        | undefined;
      const cid = ref ? ref.toString() : "";
      const ext =
        (_.get(data, "value.avatar.mimeType", "") as string).split("/")[1] ||
        "jpeg";
      return {
        avatar: cid
          ? `https://cdn.bsky.app/img/avatar/plain/${did}/${cid}@${ext}`
          : undefined,
        displayName:
          (_.get(data, "value.displayName") as string | undefined) || undefined,
      };
    }
  } catch (error) {
    consola.error(`Failed to read profile record from PDS for ${did}:`, error);
  }

  return {};
}
