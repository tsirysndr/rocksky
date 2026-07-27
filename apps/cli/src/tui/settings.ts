import fs from "fs";
import os from "os";
import path from "path";

export type RepeatName = "off" | "one" | "all";

export interface Settings {
  volume: number;
  shuffle: boolean;
  repeat: RepeatName;
  // Music Player Daemon protocol server. `enabled` only gates the copy embedded
  // in the TUI — `rocksky mpd` always serves regardless. `port` is the desired
  // port; the server falls back to the next free one if it's taken.
  mpd: {
    enabled: boolean;
    port: number;
    bind: string;
  };
  // How this player advertises itself to the web/mobile miniplayers over the
  // /ws relay. `name` is the label shown in their source selector.
  remote: {
    name: string;
  };
  equalizer: {
    enabled: boolean;
    bands: number[];
    bass: number;
    treble: number;
    crossfade: number;
    fadeInDelay: number;
    fadeInDuration: number;
    fadeOutDelay: number;
    fadeOutDuration: number;
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
  mpd: {
    enabled: false,
    port: 6600,
    bind: "127.0.0.1",
  },
  remote: {
    name: "Rocksky CLI",
  },
  equalizer: {
    enabled: false,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: 0,
    treble: 0,
    crossfade: 5, // CrossfadeMode.ALWAYS — on by default
    fadeInDelay: 0,
    fadeInDuration: 6,
    fadeOutDelay: 0,
    fadeOutDuration: 6,
    mixMode: 1, // MixMode.MIX — mix the tracks by default
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
    `[mpd]`,
    `enabled = ${s.mpd.enabled}`,
    `port = ${s.mpd.port}`,
    `bind = "${s.mpd.bind}"`,
    ``,
    `[remote]`,
    `name = "${s.remote.name}"`,
    ``,
    `[equalizer]`,
    `enabled = ${s.equalizer.enabled}`,
    `bands = [${s.equalizer.bands.join(", ")}]`,
    `bass = ${s.equalizer.bass}`,
    `treble = ${s.equalizer.treble}`,
    `crossfade = ${s.equalizer.crossfade}`,
    `fadeInDelay = ${s.equalizer.fadeInDelay}`,
    `fadeInDuration = ${s.equalizer.fadeInDuration}`,
    `fadeOutDelay = ${s.equalizer.fadeOutDelay}`,
    `fadeOutDuration = ${s.equalizer.fadeOutDuration}`,
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
    const mpd = parsed.mpd || {};
    const remote = parsed.remote || {};
    const bands = Array.isArray(eq.bands)
      ? DEFAULT_SETTINGS.equalizer.bands.map((d, i) => num(eq.bands[i], d))
      : DEFAULT_SETTINGS.equalizer.bands;
    const repeat: RepeatName =
      parsed.repeat === "one" || parsed.repeat === "all" ? parsed.repeat : "off";
    return {
      volume: num(parsed.volume, DEFAULT_SETTINGS.volume),
      shuffle: bool(parsed.shuffle, DEFAULT_SETTINGS.shuffle),
      repeat,
      mpd: {
        enabled: bool(mpd.enabled, DEFAULT_SETTINGS.mpd.enabled),
        port: num(mpd.port, DEFAULT_SETTINGS.mpd.port),
        bind:
          typeof mpd.bind === "string" ? mpd.bind : DEFAULT_SETTINGS.mpd.bind,
      },
      remote: {
        name:
          typeof remote.name === "string" && remote.name.trim().length > 0
            ? remote.name
            : DEFAULT_SETTINGS.remote.name,
      },
      equalizer: {
        enabled: bool(eq.enabled, false),
        bands,
        bass: num(eq.bass, 0),
        treble: num(eq.treble, 0),
        crossfade: num(eq.crossfade, 5),
        fadeInDelay: num(eq.fadeInDelay, 0),
        fadeInDuration: num(eq.fadeInDuration, 6),
        fadeOutDelay: num(eq.fadeOutDelay, 0),
        fadeOutDuration: num(eq.fadeOutDuration, 6),
        mixMode: num(eq.mixMode, 1),
        replaygain: num(eq.replaygain, 0),
        replaygainPreamp: num(eq.replaygainPreamp, 0),
        replaygainClip: bool(eq.replaygainClip, true),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// The player only owns the playback settings; the [mpd] and [remote] sections
// are config the player never mutates. Accept playback settings and preserve
// those sections from disk so a playback-triggered save doesn't clobber them.
export function saveSettings(s: Omit<Settings, "mpd" | "remote">): void {
  try {
    const disk = loadSettings();
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(
      settingsPath(),
      serialize({ ...s, mpd: disk.mpd, remote: disk.remote }),
    );
  } catch {
    // best-effort; ignore write errors
  }
}
