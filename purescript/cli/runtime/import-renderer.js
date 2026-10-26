import chalk from "chalk";
import dayjs from "dayjs";
import {stripVTControlCharacters} from "node:util";
import {consola} from "consola";
import {c} from "./theme.js";
const log=consola.withTag("import");
const VIOLET=c.accent,CYAN=c.secondary,TEAL=c.primary,RED=c.error,DIM=c.muted;
function printPreview(scrobbles) {
  const sample = scrobbles.slice(0, 10);
  const lines = sample.map((s) => {
    const when = dayjs.unix(s.timestamp).format("YYYY-MM-DD HH:mm");
    return DIM(when) + "  " + CYAN(s.title) + DIM(" \u2014 ") + VIOLET(s.artist) + (s.album ? DIM(`  \xB7 ${s.album}`) : "");
  });
  const more = scrobbles.length > sample.length ? [DIM(`  \u2026 and ${(scrobbles.length - sample.length).toLocaleString()} more`)] : [];
  log.log([chalk.bold("Preview (first 10):"), ...lines, ...more].join("\n"));
}
const BAR_EIGHTHS = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];
function truncate(s, n) {
  if (n <= 1) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "\u2026";
}
function renderProgress(done, total, failed, startedAt, current, skipped = 0) {
  const frac = total > 0 ? done / total : 0;
  const pct = Math.floor(frac * 100);
  const cols = process.stdout.columns || 80;
  const width = cols >= 100 ? 20 : 10;
  const exact = frac * width;
  const full = Math.floor(exact);
  const partial = BAR_EIGHTHS[Math.round((exact - full) * 8)] ?? "";
  const filledStr = "\u2588".repeat(full) + partial;
  const bar = TEAL(filledStr) + DIM("\u2500".repeat(Math.max(0, width - filledStr.length)));
  const elapsed = (Date.now() - startedAt) / 1e3;
  const rate = elapsed > 0 ? done / elapsed : 0;
  const eta = rate > 0 ? (total - done) / rate : 0;
  const counts = `${done.toLocaleString()}/${total.toLocaleString()}`;
  const head = `  ${bar} ${chalk.bold(`${String(pct).padStart(3)}%`)}  ${CYAN(counts)}` + (failed ? RED(`  \u2716${failed} failed`) : "") + DIM(`  \u21B7${skipped} skipped`) + DIM(`  ~${fmtDuration(eta)} left`);
  let tail = "";
  if (current) {
    const room = cols - stripVTControlCharacters(head).length - 5;
    if (room > 8) {
      const label = `${current.title} \u2014 ${current.artist}`;
      tail = "  " + VIOLET("\u25B8 ") + truncate(label, room);
    }
  }
  process.stdout.write(`\r${head}${tail}\x1B[K`);
}
function fmtDuration(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec % 3600 / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export {renderProgress};
