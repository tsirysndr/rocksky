import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const next = (params) => pipe(params, handleNext, presentation);
  server.app.rocksky.player.next({
    handler: async ({ params }) => {
      const result = next(params);
    },
  });
}

const handleNext = (params) => {};

const presentation = () => {};
