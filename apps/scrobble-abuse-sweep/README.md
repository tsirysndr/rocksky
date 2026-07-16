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

## The signals

Two detectors run each pass over the same lookback window (default 72h). A user
matching either is flagged; one matching both is reported once (round-the-clock
wins). Candidates are de-duplicated by DID.

### 1. Round-the-clock

A sustained looper active every hour, for days, that never sleeps. All five hold:

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

### 2. Burst

The round-the-clock detector needs a full day of history, so a **fresh account
running a dense burst** slips past it until it has polluted a day of stats. The
burst detector catches it earlier with a physical-impossibility signal: a
scrobble only registers after you've actually played most of a track, so a
stream that logs tracks _faster than they can play_ is not a human listening.

| Gate                                              | Default | Meaning                                                             |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `n >= SWEEP_BURST_MIN_SCROBBLES`                  | 150     | sustained volume                                                    |
| `longest_quiet_min < SWEEP_BURST_MAX_QUIET_MIN`   | 120     | **never takes a sleep-length break**                                |
| `fast_pct >= SWEEP_BURST_MIN_FAST_PCT`            | 30      | ≥30% of scrobbles logged within `FAST_FRACTION` of the track length |

`fast_pct` is the share of scrobbles whose gap since the previous one is under
`SWEEP_BURST_FAST_FRACTION` (default `0.5`) of the track's own duration — i.e.
the track was logged after less than half of it could have played. Calibrated
against the live user base over 72h, this flagged four burst bots
(impossibly-fast share 34–70%) and left every human clear — the heaviest genuine
listener sat at 18%, comfortably below the 30% cutoff.

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
