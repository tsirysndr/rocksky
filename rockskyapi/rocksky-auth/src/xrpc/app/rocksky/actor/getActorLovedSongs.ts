import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getActorLovedSongs = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.actor.getActorLovedSongs({
    handler: async ({ params }) => {
      const result = getActorLovedSongs(params);
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
    songs: [],
  };
};
