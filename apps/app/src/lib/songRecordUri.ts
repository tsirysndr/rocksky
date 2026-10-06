/** Listener queries address a song record, never an individual scrobble. */
export function songRecordUri(
  song: { trackUri?: string | null; uri?: string | null } | null | undefined,
  routeUri = "",
): string {
  return (
    [song?.trackUri, song?.uri, routeUri].find(
      (uri): uri is string =>
        typeof uri === "string" &&
        /^at:\/\/[^/]+\/app\.rocksky\.song\/[^/]+$/.test(uri),
    ) ?? ""
  );
}
