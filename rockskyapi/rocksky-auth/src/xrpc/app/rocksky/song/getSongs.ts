import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getSongs = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.song.getSongs({
    handler: async ({ params }) => {
      const result = getSongs(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = (params) => {
  // Logic to retrieve songs based on params
  return [];
};

const presentation = (songs) => {
  // Logic to format the songs for presentation
  return {};
};
