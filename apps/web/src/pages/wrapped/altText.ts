import type {
  WrappedAlbum,
  WrappedArtist,
  WrappedTrack,
} from "../../api/wrapped";

function numberWithCommas(n: number): string {
  return n.toLocaleString("en-US");
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  return `${h}h ${m}m`;
}

export interface WrappedAltTextInput {
  title: string;
  handle: string;
  displayName: string;
  totalScrobbles: number;
  totalListeningTimeMinutes: number;
  topArtists: WrappedArtist[];
  topAlbums: WrappedAlbum[];
  topTracks: WrappedTrack[];
}

/** Alt text describing the shareable card, reproducing the text it renders in
 *  reading order: heading, owner, totals, top artists, top albums, top tracks,
 *  footer. Only the entries the card actually draws are included, so the
 *  description never mentions a row that was cut off. */
export function wrappedAltText({
  title,
  handle,
  displayName,
  totalScrobbles,
  totalListeningTimeMinutes,
  topArtists,
  topAlbums,
  topTracks,
}: WrappedAltTextInput): string {
  const lines = [
    `Rocksky Wrapped ${title}`,
    `${displayName} (@${handle})`,
    `Total Scrobbles: ${numberWithCommas(totalScrobbles)}`,
    `${formatMinutes(totalListeningTimeMinutes)} of music`,
  ];

  const artists = topArtists.slice(0, 3);
  if (artists.length > 0) {
    lines.push(
      `Top Artists: ${artists
        .map((a, i) => `${i + 1}. ${a.name}, ${numberWithCommas(a.playCount)} plays`)
        .join("; ")}`,
    );
  }

  const albums = topAlbums.slice(0, 6);
  if (albums.length > 0) {
    lines.push(`Top Albums: ${albums.map((a) => a.title).join("; ")}`);
  }

  const tracks = topTracks.slice(0, 3);
  if (tracks.length > 0) {
    lines.push(
      `Top Tracks: ${tracks
        .map(
          (t, i) =>
            `${i + 1}. ${t.title}, ${t.artist}, ${numberWithCommas(t.playCount)} plays`,
        )
        .join("; ")}`,
    );
  }

  lines.push("rocksky.app");

  return lines.join("\n");
}
