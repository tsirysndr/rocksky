import fs from "fs";
import os from "os";
import path from "path";

export type RepeatName = "off" | "one" | "all";

export interface Settings {
  volume: number;
  shuffle: boolean;
  repeat: RepeatName;
  equalizer: {
    enabled: boolean;
    bands: number[];
    bass: number;
    treble: number;
    crossfade: number;
    crossfadeSeconds: number;
    mixMode: number;
    replaygain: number;
    replaygainPreamp: number;
    replaygainClip: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.9,
  shuffle: false,
  repeat: "off",
  equalizer: {
    enabled: false,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: 0,
    treble: 0,
    crossfade: 5, // CrossfadeMode.ALWAYS — on by default
    crossfadeSeconds: 5,
    mixMode: 0,
    replaygain: 0,
    replaygainPreamp: 0,
    replaygainClip: true,
  },
};

const settingsPath = () =>
  path.join(os.homedir(), ".rocksky", "settings.toml");

// --- tiny TOML (only what this flat schema needs) ---------------------------
function parseValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[")) {
    return v
      .slice(1, v.lastIndexOf("]"))
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);
  }
  if (v.startsWith('"')) return v.slice(1, v.lastIndexOf('"'));
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

function parseToml(text: string): Record<string, any> {
  const root: Record<string, any> = {};
  let section = root;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = root[sec[1]] = root[sec[1]] || {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    section[line.slice(0, eq).trim()] = parseValue(line.slice(eq + 1).trim());
  }
  return root;
}

function serialize(s: Settings): string {
  return [
    `volume = ${s.volume}`,
    `shuffle = ${s.shuffle}`,
    `repeat = "${s.repeat}"`,
    ``,
    `[equalizer]`,
    `enabled = ${s.equalizer.enabled}`,
    `bands = [${s.equalizer.bands.join(", ")}]`,
    `bass = ${s.equalizer.bass}`,
    `treble = ${s.equalizer.treble}`,
    `crossfade = ${s.equalizer.crossfade}`,
    `crossfadeSeconds = ${s.equalizer.crossfadeSeconds}`,
    `mixMode = ${s.equalizer.mixMode}`,
    `replaygain = ${s.equalizer.replaygain}`,
    `replaygainPreamp = ${s.equalizer.replaygainPreamp}`,
    `replaygainClip = ${s.equalizer.replaygainClip}`,
    ``,
  ].join("\n");
}

const num = (v: any, d: number) => (typeof v === "number" && !Number.isNaN(v) ? v : d);
const bool = (v: any, d: boolean) => (typeof v === "boolean" ? v : d);

/** Read settings.toml, falling back to defaults for anything missing/invalid. */
export function loadSettings(): Settings {
  try {
    const parsed = parseToml(fs.readFileSync(settingsPath(), "utf-8"));
    const eq = parsed.equalizer || {};
    const bands = Array.isArray(eq.bands)
      ? DEFAULT_SETTINGS.equalizer.bands.map((d, i) => num(eq.bands[i], d))
      : DEFAULT_SETTINGS.equalizer.bands;
    const repeat: RepeatName =
      parsed.repeat === "one" || parsed.repeat === "all" ? parsed.repeat : "off";
    return {
      volume: num(parsed.volume, DEFAULT_SETTINGS.volume),
      shuffle: bool(parsed.shuffle, DEFAULT_SETTINGS.shuffle),
      repeat,
      equalizer: {
        enabled: bool(eq.enabled, false),
        bands,
        bass: num(eq.bass, 0),
        treble: num(eq.treble, 0),
        crossfade: num(eq.crossfade, 5),
        crossfadeSeconds: num(eq.crossfadeSeconds, 5),
        mixMode: num(eq.mixMode, 0),
        replaygain: num(eq.replaygain, 0),
        replaygainPreamp: num(eq.replaygainPreamp, 0),
        replaygainClip: bool(eq.replaygainClip, true),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), serialize(s));
  } catch {
    // best-effort; ignore write errors
  }
}
