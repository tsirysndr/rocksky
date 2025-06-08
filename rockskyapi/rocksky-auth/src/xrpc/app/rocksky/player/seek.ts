import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const seek = (params) => pipe(params, handleSeek, presentation);
  server.app.rocksky.player.seek({
    handler: async ({ params }) => {
      const result = seek(params);
    },
  });
}

const handleSeek = (params) => {
  // Logic to handle seek action
  // This could involve updating the current playback position
  // based on the provided parameters.
};

const presentation = () => {
  // Logic to format the response for seek action
  // This could return the updated playback position or any relevant information.
  return {};
};
