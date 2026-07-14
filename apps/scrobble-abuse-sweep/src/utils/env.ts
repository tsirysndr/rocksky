import { bool, cleanEnv, num, str } from "envalid";
import process from "node:process";

export const env = cleanEnv(process.env, {
  XATA_POSTGRES_URL: str({
    devDefault:
      "postgresql://postgres:mysecretpassword@localhost:5433/rocksky?sslmode=disable",
  }),

  // Cron schedule for the sweep. Standard 5-field cron; default: top of every hour.
  SWEEP_CRON: str({ default: "0 * * * *" }),
  // Run one sweep immediately on boot, in addition to the cron schedule.
  SWEEP_ON_BOOT: bool({ default: true }),
  // Detect but don't write the flag — logs what it *would* flag. Use to dry-run
  // threshold changes against production before letting them block anyone.
  SWEEP_DRY_RUN: bool({ default: false }),

  // --- Detector thresholds ---------------------------------------------------
  // Validated against the live user base: these five gates flagged exactly the
  // sustained round-the-clock loopers and left every real listener untouched
  // (nearest human sat at longest_quiet ~= 743min vs the 120min cutoff — 6x margin).
  SWEEP_LOOKBACK_HOURS: num({ default: 72 }), // window analysed each run
  SWEEP_MIN_SCROBBLES: num({ default: 400 }), // sustained volume over the window
  SWEEP_MIN_SPAN_HOURS: num({ default: 24 }), // active across at least a full day
  SWEEP_MIN_HOURS_OF_DAY: num({ default: 22 }), // active in nearly every hour of day
  SWEEP_MAX_QUIET_MIN: num({ default: 120 }), // never takes a sleep-length break
  SWEEP_MAX_P90_GAP_SEC: num({ default: 300 }), // 90% of scrobbles within 5min of prior
});
