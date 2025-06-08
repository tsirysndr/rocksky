import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getScrobble = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.scrobble.getScrobble({
    handler: async ({ params }) => {
      const result = getScrobble(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve the scrobble
  return {};
};

const presentation = (scrobble) => {
  // Logic to format the scrobble for presentation
  return {
    scrobble: {},
  };
};
