import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const removeShout = (params) => pipe(params, remove, presentation);
  server.app.rocksky.shout.removeShout({
    handler: async ({ params }) => {
      const result = removeShout(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const remove = () => {
  // Logic to remove a shout
  return {};
};

const presentation = () => {
  // Logic to format the response after removing a shout
  return {};
};
