import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.like.likeShout({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
