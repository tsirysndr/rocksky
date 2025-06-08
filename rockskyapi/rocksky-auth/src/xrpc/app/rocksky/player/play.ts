import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const play = (params) => pipe(params, handlePlay, presentation);
  server.app.rocksky.player.play({
    handler: async ({ params }) => {
      const result = play(params);
    },
  });
}

const handlePlay = (params) => {
  // Logic to handle play action
};

const presentation = () => {
  // Logic to format the response for play action
  return {};
};
