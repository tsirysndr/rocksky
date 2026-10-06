import { consola } from "consola";
import type { Context } from "context";
import type { SelectTrack } from "schema/tracks";
import type { MusicbrainzTrack } from "types/track";
import type { MusicBrainzArtist } from "xrpc/app/rocksky/song/types";

export const searchOnMusicBrainz = async (
  ctx: Context,
  track: SelectTrack,
  inputMbId?: string,
  signal?: AbortSignal,
) => {
  let mbTrack;
  try {
    signal?.throwIfAborted();
    if (inputMbId) {
      const { data } = await ctx.musicbrainz.get<MusicbrainzTrack>(
        `/recording/${inputMbId}`,
        { signal },
      );
      mbTrack = data;
    } else {
      const { data } = await ctx.musicbrainz.post<MusicbrainzTrack>(
        "/hydrate",
        {
          artist: track.artist
            .replaceAll(";", ",")
            .split(",")
            .map((a) => ({ name: a.trim() })),
          name: track.title,
          album: track.album,
        },
        { signal },
      );
      mbTrack = data;

      if (!mbTrack?.trackMBID && track.album) {
        signal?.throwIfAborted();
        const response = await ctx.musicbrainz.post<MusicbrainzTrack>(
          "/hydrate",
          {
            artist: track.artist.split(",").map((a) => ({ name: a.trim() })),
            name: track.title,
          },
          { signal },
        );
        mbTrack = response.data;
      }
    }

    const mbId = mbTrack?.trackMBID;
    const artists: MusicBrainzArtist[] = mbTrack?.artist?.map((artist) => ({
      mbid: artist.mbid,
      name: artist.name,
    }));

    return {
      mbId,
      artists,
    };
  } catch (error) {
    if (!signal?.aborted)
      consola.error("Error fetching MusicBrainz data", error);
  }

  return {
    mbId: null,
    artists: null,
  };
};
