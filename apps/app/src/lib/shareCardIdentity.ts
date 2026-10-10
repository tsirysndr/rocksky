import type { ShareItem } from "./shareLinks";

type Profile = { did: string; displayName?: string; handle?: string };
const handleOf = (value?: string) => value?.trim().replace(/^@+/, "") || "";

/** Catalog records belong to an indexer, not necessarily the person sharing. */
export function shareCardActor(item: ShareItem, viewerDid: string): string {
  if (item.owner?.did) return item.owner.did;
  if (item.kind === "scrobble")
    return (
      /^at:\/\/([^/]+)\/app\.rocksky\.scrobble\//.exec(item.uri)?.[1] || ""
    );
  if (["profile", "wrapped", "chart"].includes(item.kind))
    return item.uri.replace(/^at:\/\//, "");
  return viewerDid;
}

/** Never borrow a different listener's name while the owner is loading. */
export function shareCardIdentity(
  actor: string,
  ...profiles: (Profile | null | undefined)[]
) {
  const matching = profiles.filter(
    (p): p is Profile =>
      !!actor && !!p && (p.did === actor || handleOf(p.handle) === actor),
  );
  const handle = matching.map((p) => handleOf(p.handle)).find(Boolean) || "";
  const resolved = matching.find((p) => p.displayName !== undefined);
  return {
    displayName: resolved?.displayName?.trim() || handle,
    handle: handle ? `@${handle}` : "",
    // A handle-only story must finish loading the display name before export.
    ready: !!handle && !!resolved,
  };
}
