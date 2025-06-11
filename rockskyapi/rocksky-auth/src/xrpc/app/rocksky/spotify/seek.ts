import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const seek = (params) => pipe(params, handleSeek, presentation);
  server.app.rocksky.spotify.seek({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = seek(params);
    },
  });
}

const handleSeek = (params) => {
  // Logic to handle the seek action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    seek: result,
  };
};
