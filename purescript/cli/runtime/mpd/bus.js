const SUBSYSTEMS = [
  "database",
  "player",
  "mixer",
  "options",
  "playlist",
  "stored_playlist"
];
class ChangeBus {
  // Start at 1 so a fresh connection (seen = 0) sees no spurious change.
  counters = {
    database: 1,
    player: 1,
    mixer: 1,
    options: 1,
    playlist: 1,
    stored_playlist: 1
  };
  waiters = /* @__PURE__ */ new Set();
  bump(subsystem) {
    this.counters[subsystem]++;
    for (const w of [...this.waiters]) w();
  }
  subscribe(cb) {
    this.waiters.add(cb);
    return () => this.waiters.delete(cb);
  }
  snapshot() {
    return { ...this.counters };
  }
}
const bus = new ChangeBus();
export {
  SUBSYSTEMS,
  bus
};
