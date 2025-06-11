import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const next = (params) => pipe(params, handleNext, presentation);
  server.app.rocksky.spotify.next({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = next(params);
    },
  });
}

const handleNext = (params) => {
  // Logic to handle the next action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    next: result,
  };
};
