import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getArtistShouts = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.shout.getArtistShouts({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve artist shouts
  return [];
};

const presentation = (shouts) => {
  // Logic to format the shouts for presentation
  return {
    shouts: [],
  };
};
