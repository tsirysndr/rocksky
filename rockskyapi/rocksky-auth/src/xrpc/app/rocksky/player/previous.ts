import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const previous = (params) => pipe(params, handlePrevious, presentation);
  server.app.rocksky.player.previous({
    handler: async ({ params }) => {
      const result = previous(params);
    },
  });
}

const handlePrevious = (params) => {
  // Logic to handle previous action
};

const presentation = () => {
  // Logic to format the response for previous action
  return {};
};
