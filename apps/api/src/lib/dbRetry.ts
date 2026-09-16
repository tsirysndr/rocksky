import { Duration, Schedule } from "effect";

// Errors that mean "the connection died under us" — a fresh attempt on a new
// pooled client is likely to work.
const TRANSIENT = [
  "econnreset",
  "epipe",
  "connection terminated",
  "connection ended unexpectedly",
  "server closed the connection unexpectedly",
  "client has encountered a connection error",
  "terminating connection due to administrator command",
];

// Errors that mean the database is already over capacity. Retrying these is
// what turns a slow database into an outage: every retry is another connection
// checkout queued behind the ones that are already stuck.
const FATAL = [
  "timeout exceeded when trying to connect",
  "canceling statement due to statement timeout",
  "canceling statement due to user request",
  "too many clients already",
  "remaining connection slots are reserved",
];

const messageOf = (err: unknown): string => {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === "string") return err.toLowerCase();
  return String(err).toLowerCase();
};

export const isTransientDbError = (err: unknown): boolean => {
  const message = messageOf(err);
  if (FATAL.some((needle) => message.includes(needle))) return false;
  return TRANSIENT.some((needle) => message.includes(needle));
};

/**
 * Replacement for `Effect.retry({ times: 3 })` on database-backed effects.
 *
 * The old policy retried every failure with no delay, so a saturated pool got
 * four checkout attempts per request instead of one — the retries themselves
 * were most of the load. This one backs off, retries at most twice, and only
 * for errors where a retry can actually succeed.
 */
export const transientDbRetry = Schedule.exponential(
  Duration.millis(100),
  2,
).pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2)),
  Schedule.whileInput(isTransientDbError),
);
