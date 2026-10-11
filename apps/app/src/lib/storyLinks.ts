export type StoryLink = {
  name: "Spotify" | "MusicBrainz" | "Discogs" | "PDSls";
  url: string;
};
export function storyLinks(data: {
  spotifyLink?: string | null;
  mbId?: string | null;
  discogsLink?: string;
  uri?: string;
}): StoryLink[] {
  const links: StoryLink[] = [];
  const https = (value: string | null | undefined, hosts: string[]) => {
    try {
      const url = new URL(value || "");
      return url.protocol === "https:" && hosts.includes(url.hostname)
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  };
  const spotify = https(data.spotifyLink, ["open.spotify.com"]);
  if (spotify) links.push({ name: "Spotify", url: spotify });
  const mbId = data.mbId?.trim();
  if (mbId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(mbId))
    links.push({
      name: "MusicBrainz",
      url: `https://musicbrainz.org/recording/${mbId}`,
    });
  const discogs = https(data.discogsLink, ["www.discogs.com", "discogs.com"]);
  if (discogs) links.push({ name: "Discogs", url: discogs });
  if (
    data.uri &&
    /^at:\/\/[^/]+\/app\.rocksky\.(song|scrobble)\/[^/?#]+$/.test(data.uri)
  )
    links.push({
      name: "PDSls",
      url: `https://pdsls.dev/at/${data.uri.slice(5)}`,
    });
  return links;
}
