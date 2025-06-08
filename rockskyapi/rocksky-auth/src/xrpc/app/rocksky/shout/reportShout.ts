import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const reportShout = (params) => pipe(params, report, presentation);
  server.app.rocksky.shout.reportShout({
    handler: async ({ params }) => {
      const result = reportShout(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const report = () => {
  // Logic to report a shout
  return {};
};

const presentation = () => {
  // Logic to format the report for presentation
  return {};
};
