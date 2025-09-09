import type { Context } from "context";
import type { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.googledrive.downloadFile({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      download();
      throw new Error("Not implemented yet");
    },
  });
}

const download = () => {
  // Logic to download a file from Google Drive
};
