import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getSong = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.song.getSong({
    handler: async ({ params }) => {
      const result = getSong(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = (params) => {
  // Logic to retrieve the song based on params
  return {};
};

const presentation = (song) => {
  // Logic to format the song for presentation
  return {};
};
