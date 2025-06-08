import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getArtists = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.artist.getArtists({
    handler: async ({ params }) => {
      const result = getArtists(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve artists
  return [];
};

const presentation = () => {
  // Logic to format the artists for presentation
  return {
    artists: [],
  };
};
