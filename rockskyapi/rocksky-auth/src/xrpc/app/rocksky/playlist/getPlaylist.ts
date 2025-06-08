import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getPlaylist = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.playlist.getPlaylist({
    handler: async ({ params }) => {
      const result = getPlaylist(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve the playlist
  return {};
};

const presentation = (playlist) => {
  // Logic to format the playlist for presentation
  return {};
};
