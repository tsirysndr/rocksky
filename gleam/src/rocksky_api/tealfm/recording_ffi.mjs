import { Ok, Error as GError } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

const fold = (s) => (s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const versionTitle = (s) => fold(s.replace(/[(\[]([^()\[\]]+?)\s+version[)\]]$/i, "($1)"));
const isrcKey = (s) => (s ?? "").replaceAll("-", "").toUpperCase();

export function selectRecording(rows, title, artist, album, duration, isrc) {
  const wanted = isrcKey(isrc);
  const ids = new Set();
  for (const row of rows) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id)) continue;
    const codes = (row.isrcs ?? []).map(isrcKey);
    const exact = Boolean(wanted && codes.includes(wanted));
    if (wanted && codes.length && !exact) continue;
    const credits = row["artist-credit"] ?? [];
    const names = credits.map(c => c.name || c.artist?.name || "");
    const artistsMatch = [names.join(", "), credits.map((c,i) => names[i]+(c.joinphrase || "")).join(""),
      credits.map(c => c.artist?.["sort-name"] || c.name).join(", ")].some(v => fold(v) === fold(artist));
    if (!artistsMatch) continue;
    const sameTitle = fold(row.title) === fold(title) || (exact && versionTitle(row.title) === versionTitle(title));
    const creditSuffix = title.match(/\s*[([]feat\.?\s+(.+?)[)\]]$/i);
    const knownGuests = creditSuffix && names.slice(1).some(n => fold(n) === fold(creditSuffix[1]));
    if (!sameTitle && !(exact && knownGuests && fold(title.slice(0,creditSuffix.index)) === fold(row.title))) continue;
    const timed = duration > 1000 && row.length > 0;
    if (timed && Math.abs(row.length-duration) > Math.max(5000, duration*0.02)) continue;
    if (!exact && !(timed && (row.releases ?? []).some(r => fold(r.title) === fold(album)))) continue;
    ids.add(row.id);
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

export async function lookup(base, title, artist, album, duration, isrc) {
  try {
    // Keep release metadata for validation. Including it in the search query
    // hides recordings listed under a single, reissue or translated title.
    const body = {Track:title, Artist:artist.split(", ")[0]};
    if (/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrcKey(isrc))) body.ISRC = isrcKey(isrc);
    const response = await fetch(base.replace(/\/$/,"")+"/search", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify(body), signal:AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new Error("MusicBrainz search returned HTTP "+response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid MusicBrainz search result");
    const id = selectRecording(rows,title,artist,album,duration,isrc);
    return new Ok(id ? new Some(id) : new None());
  } catch (error) { return new GError(error); }
}

export function forQueue(record, isrc) {
  return {...record, ...(isrc ? {isrc} : {}),
    ...(record.recordingMbId ? {} : {_rockskyResolveRecording:true})};
}
export async function resolvePending(base, record) {
  if (record._rockskyResolveRecording !== true) return new Ok(new Some(record));
  const {_rockskyResolveRecording, ...play} = record;
  const result = await lookup(base, play.trackName, play.artists.map(a => a.artistName).join(", "),
    play.releaseName ?? "", (play.duration ?? 0)*1000, play.isrc ?? "");
  if (result instanceof GError) return result;
  const id = result[0];
  return new Ok(id instanceof Some ? new Some({...play,recordingMbId:"mbid:"+id[0]}) : new None());
}
