# scrobble-abuse-sweep

A standalone Deno service that periodically scans the scrobble stream for
sustained, round-the-clock bot behaviour and flags offending accounts in the
`users` table (`is_bot = true`). The api enforces that flag on every scrobble
(`apps/api/src/lib/scrobbleGuard.ts`), so flagged accounts are rejected until an
operator clears the flag.

It complements the inline `scrobbleGuard` in the api: that guard is a real-time
rolling-window rate limiter (25 scrobbles / 30min), which a _slow_ bot pacing
itself just under the threshold evades. This sweep catches that slow burn with a
duration-based signal instead of a rate one.

## The signal

Per user, over a lookback window (default 72h), all five must hold:

| Gate                                      | Default | Meaning                                        |
| ----------------------------------------- | ------- | ---------------------------------------------- |
| `span_h >= SWEEP_MIN_SPAN_HOURS`          | 24      | active across at least a full day              |
| `n >= SWEEP_MIN_SCROBBLES`                | 400     | sustained volume                               |
| `hrs_of_day >= SWEEP_MIN_HOURS_OF_DAY`    | 22      | active in nearly every hour of the day         |
| `longest_quiet_min < SWEEP_MAX_QUIET_MIN` | 120     | **never takes a sleep-length break**           |
| `p90_gap < SWEEP_MAX_P90_GAP_SEC`         | 300     | 90% of scrobbles land within 5min of the prior |

The defining gate is `longest_quiet_min`: a real listener — even a heavy one who
runs music all day — always has at least one multi-hour silent stretch (sleep).
When first calibrated against the live user base, the nearest genuine listener
sat at a longest-quiet of ~743min against the 120min cutoff — a ~6x margin — so
no human is caught.

## Run

```sh
deno task start        # cron loop (prod runs this under: doppler run -- deno task start)
deno task dev          # cron loop with --watch
deno task sweep:once   # single pass, then exit (set SWEEP_DRY_RUN=true to preview)
```

`Deno.cron` requires `--unstable-cron`, already wired into the `start`/`dev`
tasks.

## Safe rollout

Set `SWEEP_DRY_RUN=true` first. The sweep then logs exactly which accounts it
_would_ flag without writing anything — verify the list is all bots before
letting it enforce. Retune via the `SWEEP_*` env vars; no code change needed.

## Clearing a false positive

```sql
UPDATE users SET is_bot = false, bot_flagged_at = NULL, bot_reason = NULL
WHERE handle = '<handle>';
```
