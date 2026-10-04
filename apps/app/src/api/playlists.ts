import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

// Playlist writes go through app.rocksky.library.*, never straight to
// navidrome: the API runs the same navidrome call and then mirrors the change
// onto the user's PDS as an app.rocksky.playlist record. Going direct would
// skip the mirror and silently drift the repo from the library.
//
// XRPC procedures accept their arguments in the JSON request body.

type PlaylistMutation = {
  status?: string;
  playlist?: { id?: string; name?: string };
  /** AT-URI of the mirrored record, when one was published or already existed. */
  uri?: string;
  /** Set when the library change stuck but the PDS record didn't. */
  atprotoError?: string;
};

/** A mirror failure: the library change landed, the PDS record didn't. */
export class PlaylistMirrorWarning extends Error {
  constructor(
    message: string,
    public playlistId?: string,
  ) {
    super(message);
    this.name = "PlaylistMirrorWarning";
  }
}

const authHeaders = () => ({
  authorization: `Bearer ${storage.getToken()}`,
});

const procedure = async (
  method: string,
  params: Record<string, string | number>,
): Promise<PlaylistMutation> => {
  const response = await axios.post<PlaylistMutation>(
    `${API_URL}/xrpc/${method}`,
    params,
    { headers: authHeaders() },
  );
  return response.data ?? {};
};

const throwIfMirrorFailed = (result: PlaylistMutation) => {
  if (result.atprotoError) throw new PlaylistMirrorWarning(result.atprotoError);
};

/** The new playlist's id. The mirror error, if any, is raised after. */
export const createPlaylist = async (name: string): Promise<string | null> => {
  const result = await procedure("app.rocksky.library.createPlaylist", {
    name,
  });
  const id = result.playlist?.id ?? null;
  if (result.atprotoError)
    throw new PlaylistMirrorWarning(result.atprotoError, id ?? undefined);
  if (!id) throw new Error("The server did not return a playlist.");
  return id;
};

export const renamePlaylist = async (
  playlistId: string,
  name: string,
): Promise<void> => {
  throwIfMirrorFailed(
    await procedure("app.rocksky.library.updatePlaylist", { playlistId, name }),
  );
};

export const setPlaylistDescription = async (
  playlistId: string,
  comment: string,
): Promise<void> => {
  throwIfMirrorFailed(
    await procedure("app.rocksky.library.updatePlaylist", {
      playlistId,
      comment,
    }),
  );
};

export const addTrackToPlaylist = async (
  playlistId: string,
  songId: string,
): Promise<void> => {
  throwIfMirrorFailed(
    await procedure("app.rocksky.library.updatePlaylist", {
      playlistId,
      songIdToAdd: songId,
    }),
  );
};

export const removeTrackFromPlaylist = async (
  playlistId: string,
  index: number,
): Promise<void> => {
  throwIfMirrorFailed(
    await procedure("app.rocksky.library.updatePlaylist", {
      playlistId,
      songIndexToRemove: index,
    }),
  );
};

export const deletePlaylist = async (playlistId: string): Promise<void> => {
  throwIfMirrorFailed(
    await procedure("app.rocksky.library.deletePlaylist", { id: playlistId }),
  );
};
