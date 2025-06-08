import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getActorProfile = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.actor.getProfile({
    handler: async ({ params }) => {
      const result = getActorProfile(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve the actor's profile
  return {};
};

const presentation = (profile) => {
  // Logic to format the profile for presentation
  return {};
};
