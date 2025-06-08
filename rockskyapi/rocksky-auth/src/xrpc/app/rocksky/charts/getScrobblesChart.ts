import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getScrobblesChart = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.charts.getScrobblesChart({
    handler: async ({ params }) => {
      const result = getScrobblesChart(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve scrobbles chart data
  return [];
};

const presentation = (scrobbles) => {
  // Logic to format the scrobbles chart data for presentation
  return {
    scrobbles: [],
  };
};
