import type { InfiniteData } from "@tanstack/react-query";
import {
  type LibraryPage,
  type RemoteTrackMetadata,
  remoteLibraries,
} from "../api/remoteLibraries";
import { type SearchHit, search } from "../api/search";
import { queryClient } from "./queryClient";
import type { UploadQueueTrack } from "./uploadEngine";

const normalized = (value: string | undefined) =>
  (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
const httpImage = (value: string | undefined) =>
  value && /^https?:\/\//i.test(value) ? value : "";
export function matchedArtistPicture(hits: SearchHit[], artist: string) {
  const matches = hits.filter(
    (hit) =>
      hit.uri?.includes("/app.rocksky.artist/") &&
      normalized(hit.name) === normalized(artist) &&
      httpImage(hit.picture),
  );
  const pictures = [...new Set(matches.map((hit) => hit.picture || ""))];
  return pictures.length === 1 ? pictures[0] : "";
}
export function matchedAlbumCover(
  hits: SearchHit[],
  artist: string,
  album: string,
) {
  if (!artist.trim() || !album.trim()) return "";
  const matches = hits.filter(
    (hit) =>
      normalized(hit.artist) === normalized(artist) &&
      normalized(
        hit.album ||
          (hit.uri?.includes("/app.rocksky.album/")
            ? hit.title || hit.name
            : ""),
      ) === normalized(album),
  );
  return (
    matches.map((hit) => httpImage(hit.albumArt || hit.cover)).find(Boolean) ||
    ""
  );
}
function updateBrowser(
  sourceId: string,
  trackId: string,
  data: RemoteTrackMetadata,
) {
  queryClient.setQueriesData<InfiniteData<LibraryPage>>(
    { queryKey: ["remote-library", sourceId] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          entries: page.entries.map((entry) => {
            if (entry.kind === "track" && entry.id === trackId)
              return {
                ...entry,
                title: data.title || entry.title,
                artist: data.artist || entry.artist,
                album: data.album || entry.album,
                durationMs: data.durationMs || entry.durationMs,
                art: data.albumArt || entry.art,
              };
            if (
              entry.kind === "artist" &&
              normalized(entry.title) === normalized(data.artist) &&
              data.artistPicture
            )
              return { ...entry, art: data.artistPicture };
            const album = entry.kind === "album" ? entry.title : entry.album;
            if (
              normalized(album) === normalized(data.album) &&
              data.album &&
              [data.artist, data.albumArtist].some(
                (name) => name && normalized(name) === normalized(entry.artist),
              ) &&
              data.albumArt
            )
              return { ...entry, art: data.albumArt };
            return entry;
          }),
        })),
      },
  );
}
const inFlight = new Map<string, Promise<Partial<UploadQueueTrack> | null>>();
export function enrichRemoteTrack(
  track: UploadQueueTrack,
): Promise<Partial<UploadQueueTrack> | null> {
  const sourceId = track.remoteLibraryId;
  const trackId = track.remoteTrackId;
  if (!sourceId || !trackId) return Promise.resolve(null);
  const key = JSON.stringify([sourceId, trackId]);
  const previous = inFlight.get(key);
  if (previous) return previous;
  const work = (async () => {
    let data = await remoteLibraries.metadata(sourceId, trackId, {
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      albumArt: track.albumArt,
      durationMs: track.durationMs,
    });
    updateBrowser(sourceId, trackId, data);
    const needsArtist =
      !data.artistPicture &&
      Date.now() - (data.artistLookupAt || 0) > 7 * 86400000;
    const needsAlbum =
      !data.albumArt && Date.now() - (data.artworkLookupAt || 0) > 7 * 86400000;
    const needsArtwork =
      !data.nativeEnrichment && data.artist && (needsArtist || needsAlbum);
    if (needsArtwork) {
      try {
        const lookup = (query: string) =>
          queryClient.fetchQuery({
            queryKey: ["remote-artwork-search", normalized(query)],
            queryFn: () => search(query),
            staleTime: 24 * 60 * 60_000,
            gcTime: 24 * 60 * 60_000,
            retry: false,
          });
        const artistHits = !needsArtist
          ? { hits: [] }
          : await lookup(data.artist);
        const albumHits =
          !needsAlbum || !data.album
            ? { hits: [] }
            : await lookup(`${data.artist} ${data.album}`);
        data = await remoteLibraries.cacheArtwork(
          sourceId,
          trackId,
          data.artist,
          data.artistPicture ||
            matchedArtistPicture(artistHits.hits, data.artist),
          matchedAlbumCover(
            albumHits.hits,
            data.albumArtist || data.artist,
            data.album,
          ),
        );
        updateBrowser(sourceId, trackId, data);
      } catch {
        /* Keep parsed metadata when online artwork lookup is unavailable. */
      }
    }
    return {
      title: data.title || track.title,
      artist: data.artist || track.artist,
      album: data.album || track.album,
      albumArtist: data.albumArtist || data.artist || track.albumArtist,
      albumArt: data.albumArt || track.albumArt,
      durationMs: data.durationMs || track.durationMs,
    };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
