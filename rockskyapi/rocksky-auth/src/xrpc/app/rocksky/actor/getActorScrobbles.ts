import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getActorScrobbles = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.actor.getActorScrobbles({
    handler: async ({ params }) => {
      const result = getActorScrobbles(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve scrobbles for the actor
  return [];
};

const presentation = (scrobbles) => {
  // Logic to format the scrobbles for presentation
  return {
    scrobbles: [],
  };
};
