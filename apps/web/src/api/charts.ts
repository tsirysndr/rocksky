import type { ChartsView } from "@rocksky/sdk";
import { rocksky } from "../lib/rocksky";

export const getScrobblesChart = () => {
  return [];
};

export const getSongChart = (uri: string): Promise<ChartsView> => {
  return rocksky().scrobblesChart({ songuri: uri });
};

export const getArtistChart = (uri: string): Promise<ChartsView> => {
  return rocksky().scrobblesChart({ artisturi: uri });
};

export const getAlbumChart = (uri: string): Promise<ChartsView> => {
  return rocksky().scrobblesChart({ albumuri: uri });
};

export const getProfileChart = (did: string): Promise<ChartsView> => {
  return rocksky().scrobblesChart({ did });
};

export const getGenreChart = (genre: string): Promise<ChartsView> => {
  return rocksky().scrobblesChart({ genre });
};
