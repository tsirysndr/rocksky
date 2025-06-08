import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getActorSongs = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.actor.getActorSongs({
    handler: async ({ params }) => {
      const result = getActorSongs(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve songs for the actor
  return [];
};

const presentation = (songs) => {
  // Logic to format the songs for presentation
  return {
    songs: [],
  };
};
