import cron from "node-cron";

// Every schedule runs on UTC so the clocks never move under node-cron. On a
// DST fall-back the local hour repeats, node-cron reads its jobs as forever
// overdue and spins the event loop re-evaluating them; the server stays up but
// stops accepting connections. UTC has no such discontinuity. The expressions
// are all fixed intervals, so this does not shift when anything fires.
export const schedule = (expression, task) => {
  cron.schedule(expression, () => task(), { timezone: "UTC" });
};
