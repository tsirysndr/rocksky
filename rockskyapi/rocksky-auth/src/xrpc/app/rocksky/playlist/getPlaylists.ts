import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getPlaylists = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.playlist.getPlaylists({
    handler: async ({ params }) => {
      const result = getPlaylists(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve playlists
  return [];
};

const presentation = (playlists) => {
  // Logic to format the playlists for presentation
  return {
    playlists: [],
  };
};
