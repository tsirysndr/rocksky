// A tiny change bus shared by the server's idle machinery and the `status`
// command. Each MPD "subsystem" has a monotonic counter; the server's poller
// bumps a counter when it detects that facet of player state changed, and idle
// connections wake when a counter they care about advances.

export type Subsystem =
  | "database"
  | "player"
  | "mixer"
  | "options"
  | "playlist"
  | "stored_playlist";

export const SUBSYSTEMS: Subsystem[] = [
  "database",
  "player",
  "mixer",
  "options",
  "playlist",
  "stored_playlist",
];

class ChangeBus {
  // Start at 1 so a fresh connection (seen = 0) sees no spurious change.
  readonly counters: Record<Subsystem, number> = {
    database: 1,
    player: 1,
    mixer: 1,
    options: 1,
    playlist: 1,
    stored_playlist: 1,
  };

  private waiters = new Set<() => void>();

  bump(subsystem: Subsystem): void {
    this.counters[subsystem]++;
    // Notify on a copy so a waiter that unsubscribes mid-iteration is safe.
    for (const w of [...this.waiters]) w();
  }

  subscribe(cb: () => void): () => void {
    this.waiters.add(cb);
    return () => this.waiters.delete(cb);
  }

  snapshot(): Record<Subsystem, number> {
    return { ...this.counters };
  }
}

export const bus = new ChangeBus();
