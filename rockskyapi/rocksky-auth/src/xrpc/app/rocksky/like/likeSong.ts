import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const likeSong = (params) => pipe(params, like, presentation);
  server.app.rocksky.like.likeSong({
    handler: async ({ params }) => {
      const result = likeSong(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const like = () => {
  // Logic to like a song
  return {};
};

const presentation = () => {
  // Logic to format the response for presentation
  return {};
};
