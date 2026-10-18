import cron from "node-cron";
export const schedule = (expression, task) => {
  cron.schedule(expression, () => task());
};
