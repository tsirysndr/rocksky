import { atom } from "jotai";

export const recentTracksAtom = atom<
  {
    album: string;
    albumArt?: string;
    artist: string;
    albumArtist: string;
    albumUri: string;
    artistUri: string;
    uri: string;
    title: string;
    date: string;
    id: string;
    /** The song's AT-URI — `uri` above is the scrobble's. */
    trackUri?: string;
    /** Falls back for tracks with no song record yet. */
    trackId?: string;
    liked?: boolean;
  }[]
>([]);
