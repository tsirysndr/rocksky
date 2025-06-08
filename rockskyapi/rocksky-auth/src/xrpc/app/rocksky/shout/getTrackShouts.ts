import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getTrackShouts = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.shout.getTrackShouts({
    handler: async ({ params }) => {
      const result = getTrackShouts(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve shouts for the track
  return [];
};

const presentation = (shouts) => {
  // Logic to format the shouts for presentation
  return {
    shouts: [],
  };
};
