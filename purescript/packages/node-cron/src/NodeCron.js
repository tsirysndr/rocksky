import cron from "node-cron";
export const scheduleImpl = (expr, job) => cron.schedule(expr, () => job());
export const stop = (t) => () => {
  t.stop();
};
