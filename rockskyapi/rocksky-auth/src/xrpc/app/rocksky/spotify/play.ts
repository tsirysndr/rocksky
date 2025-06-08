import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const play = (params) => pipe(params, handlePlay, presentation);
  server.app.rocksky.spotify.play({
    handler: async ({ params }) => {
      const result = play(params);
    },
  });
}

const handlePlay = (params) => {
  // Logic to handle the play action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    play: result,
  };
};
