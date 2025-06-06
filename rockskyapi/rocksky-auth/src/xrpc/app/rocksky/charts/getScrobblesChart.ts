import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.charts.getScrobblesChart({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
