import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const previous = (params) => pipe(params, handlePrevious, presentation);
  server.app.rocksky.spotify.previous({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = previous(params);
    },
  });
}

const handlePrevious = (params) => {
  // Logic to handle the previous action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    previous: result,
  };
};
