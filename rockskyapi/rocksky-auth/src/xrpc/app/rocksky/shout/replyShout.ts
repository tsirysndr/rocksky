import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.shout.replyShout({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
