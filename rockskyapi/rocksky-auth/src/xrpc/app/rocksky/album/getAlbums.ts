import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getAlbums = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.album.getAlbums({
    handler: async ({ params }) => {
      const result = getAlbums(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve albums
  return [];
};

const presentation = (albums) => {
  // Logic to format the albums for presentation
  return {
    albums: [],
  };
};
