import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const dislikeShout = (params) => pipe(params, dislike, presentation);
  server.app.rocksky.like.dislikeShout({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = dislikeShout(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const dislike = () => {
  // Logic to dislike a shout
  return {};
};

const presentation = () => {
  // Logic to format the response for presentation
  return {};
};
