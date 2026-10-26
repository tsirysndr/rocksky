import chalk from "chalk";
import { execSync } from "child_process";
import * as fs from "fs";
function detectLightTerminal() {
  const vscodeTheme = process.env.VSCODE_THEME_KIND;
  if (vscodeTheme) {
    return vscodeTheme === "vscode-light" || vscodeTheme === "vscode-high-contrast-light";
  }
  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg) {
    const parts = colorfgbg.split(";");
    const bg = parseInt(parts[parts.length - 1] ?? "", 10);
    if (!isNaN(bg)) return bg >= 8;
  }
  if (process.stdout.isTTY) {
    try {
      const savedState = execSync("stty -g </dev/tty 2>/dev/null", {
        encoding: "utf8"
      }).trim();
      if (!savedState) return false;
      const tty = fs.openSync("/dev/tty", "r+");
      try {
        execSync("stty -icanon -echo min 0 time 2 </dev/tty 2>/dev/null");
        fs.writeSync(tty, "\x1B]11;?\x07");
        let resp = "";
        const buf = Buffer.alloc(64);
        for (let i = 0; i < 16; i++) {
          const n = fs.readSync(tty, buf, 0, 64, null);
          if (n === 0) break;
          resp += buf.slice(0, n).toString();
          if (resp.includes("\x07") || resp.includes("\x1B\\")) break;
        }
        const m = resp.match(/rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i);
        if (m?.[1] && m[2] && m[3]) {
          const norm = (h) => parseInt(h.slice(0, 2), 16);
          const r = norm(m[1]), g = norm(m[2]), b = norm(m[3]);
          return 0.299 * r + 0.587 * g + 0.114 * b > 127;
        }
      } finally {
        try {
          fs.closeSync(tty);
        } catch {
        }
        try {
          execSync(`stty ${savedState} </dev/tty 2>/dev/null`);
        } catch {
        }
      }
    } catch {
    }
  }
  return false;
}
let lightTerminal = null;
function isLightTerminal() {
  if (lightTerminal === null) lightTerminal = detectLightTerminal();
  return lightTerminal;
}
const PRIMARY = "#00E8C6";
const SECONDARY = "#00C6E8";
const ACCENT = "#8264FF";
const HIGHLIGHT = "#64E882";
const MUTED = "#C8D2DC";
const LINK = "#FFA064";
const SKY = "#00D2FF";
const ERROR = "#FF6464";
const c = {
  primary: (s) => chalk.rgb(0, 232, 198)(s),
  secondary: (s) => chalk.rgb(0, 198, 232)(s),
  accent: (s) => chalk.rgb(130, 100, 255)(s),
  highlight: (s) => chalk.rgb(100, 232, 130)(s),
  muted: (s) => isLightTerminal() ? chalk.black(s) : chalk.rgb(200, 210, 220)(s),
  link: (s) => chalk.rgb(255, 160, 100)(s),
  sky: (s) => chalk.rgb(0, 210, 255)(s),
  error: (s) => chalk.rgb(255, 100, 100)(s)
};
export {
  ACCENT,
  ERROR,
  HIGHLIGHT,
  LINK,
  MUTED,
  PRIMARY,
  SECONDARY,
  SKY,
  c
};
