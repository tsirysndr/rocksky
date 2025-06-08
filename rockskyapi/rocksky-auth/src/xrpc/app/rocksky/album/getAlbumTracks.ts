import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getAlbumTracks = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.album.getAlbumTracks({
    handler: async ({ params }) => {
      const result = getAlbumTracks(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve album tracks
  return [];
};

const presentation = (tracks) => {
  // Logic to format the tracks for presentation
  return {
    tracks: [],
  };
};
