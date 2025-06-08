import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const likeShout = (params) => pipe(params, like, presentation);
  server.app.rocksky.like.likeShout({
    handler: async ({ params }) => {
      const result = likeShout(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const like = () => {
  // Logic to like a shout
  return {};
};

const presentation = () => {
  // Logic to format the response for presentation
  return {};
};
