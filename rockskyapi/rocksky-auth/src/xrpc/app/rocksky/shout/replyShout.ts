import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const replyShout = (params) => pipe(params, reply, presentation);
  server.app.rocksky.shout.replyShout({
    handler: async ({ params }) => {
      const result = replyShout(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const reply = () => {
  // Logic to reply to a shout
  return {};
};

const presentation = () => {
  // Logic to format the reply for presentation
  return {};
};
