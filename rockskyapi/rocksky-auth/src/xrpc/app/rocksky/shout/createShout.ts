import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const createShout = (params) => pipe(params, create, presentation);
  server.app.rocksky.shout.createShout({
    handler: async ({ input }) => {
      const result = createShout(input);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const create = () => {
  // Logic to create a shout
  return {};
};

const presentation = () => {
  // Logic to format the shout for presentation
  return {};
};
