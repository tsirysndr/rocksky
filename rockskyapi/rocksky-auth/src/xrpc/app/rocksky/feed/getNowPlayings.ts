import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getNowPlayings = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.feed.getNowPlayings({
    handler: async ({ params }) => {
      const result = getNowPlayings(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve now playing songs
  return [];
};

const presentation = (nowPlayings) => {
  // Logic to format the now playing songs for presentation
  return {
    nowPlayings: [],
  };
};
