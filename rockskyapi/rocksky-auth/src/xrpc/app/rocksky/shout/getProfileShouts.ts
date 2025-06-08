import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getProfileShouts = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.shout.getProfileShouts({
    handler: async ({ params }) => {
      const result = getProfileShouts(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve shouts for the profile
  return [];
};

const presentation = (shouts) => {
  // Logic to format the shouts for presentation
  return {
    shouts: [],
  };
};
