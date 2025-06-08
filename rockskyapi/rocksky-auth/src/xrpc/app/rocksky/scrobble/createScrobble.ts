import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const createScrobble = (input) => pipe(input, create, presentation);
  server.app.rocksky.scrobble.createScrobble({
    handler: async ({ input }) => {
      const result = createScrobble(input);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const create = () => {
  // Logic to create a scrobble
  return {};
};

const presentation = () => {
  // Logic to format the scrobble for presentation
  return {};
};
