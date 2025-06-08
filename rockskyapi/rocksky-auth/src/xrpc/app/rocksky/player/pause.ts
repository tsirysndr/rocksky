import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const pause = (params) => pipe(params, handlePause, presentation);
  server.app.rocksky.player.pause({
    handler: async ({ params }) => {
      const result = pause(params);
    },
  });
}

const handlePause = (params) => {};

const presentation = () => {
  return {};
};
