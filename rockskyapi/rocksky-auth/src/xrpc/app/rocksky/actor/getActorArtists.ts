import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getActorArtists = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.actor.getActorArtists({
    handler: async ({ params }) => {
      const result = getActorArtists(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  return [];
};

const presentation = () => {
  return {
    artists: [],
  };
};
