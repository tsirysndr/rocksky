import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getCurrentlyPlaying = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.spotify.getCurrentlyPlaying({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = getCurrentlyPlaying(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve currently playing track
  return {};
};

const presentation = (currentlyPlaying) => {
  // Logic to format the currently playing track for presentation
  return {};
};
