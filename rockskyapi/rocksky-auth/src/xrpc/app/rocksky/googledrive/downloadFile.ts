import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.googledrive.downloadFile({
    handler: async ({ params }) => {
      throw new Error("Not implemented yet");
    },
  });
}
