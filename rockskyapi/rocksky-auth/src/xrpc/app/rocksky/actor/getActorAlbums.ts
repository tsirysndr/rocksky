import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getActorAlbums = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.actor.getActorAlbums({
    handler: async ({ params }) => {
      const result = getActorAlbums(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve albums for the actor
  return [];
};

const presentation = () => {
  return {
    albums: [],
  };
};
