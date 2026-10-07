import type { RemoteAudioSettings } from "@rocksky/sdk";
import { requireOptionalNativeModule } from "expo";

type RockskyEngineNativeModule = {
  localLibrary(): Promise<string>;
  scanLocalMusic(): Promise<void>;
  mutateLocalMusic(json: string): Promise<string>;
  localMusicPath(id: string): Promise<string>;
  fingerprintLocalTrack(id: string): Promise<string>;
  isAvailable(): boolean;
  command(json: string): string;
};

export type EngineState = "playing" | "paused" | "stopped";
export type EngineRepeat = "off" | "one" | "all";

export type EngineStatus = {
  ok: true;
  state: EngineState;
  index: number | null;
  positionMs: number;
  durationMs: number;
  queueLen: number;
  shuffle: boolean;
  repeat: EngineRepeat;
  volume: number;
};

export type EngineAck = { ok: true };
export type EngineError = { ok: false; error: string };

export type EngineCommand =
  | { cmd: "open"; paths: string[]; startIndex: number }
  | { cmd: "play" }
  | { cmd: "pause" }
  | { cmd: "next" }
  | { cmd: "previous" }
  | { cmd: "seek"; positionMs: number }
  | { cmd: "skipTo"; index: number }
  | { cmd: "append"; paths: string[] }
  | { cmd: "insertNext"; paths: string[] }
  | { cmd: "remove"; index: number }
  | { cmd: "setVolume"; volume: number }
  | { cmd: "setShuffle"; enabled: boolean }
  | { cmd: "setRepeat"; mode: EngineRepeat }
  | { cmd: "setAudioSettings"; settings: RemoteAudioSettings }
  | { cmd: "stop" }
  | { cmd: "status" };

const native =
  requireOptionalNativeModule<RockskyEngineNativeModule>("RockskyEngine");

export const localMusicNative = {
  async fingerprint(id: string): Promise<string> {
    if (!native)
      throw new Error("Local music requires an Android native build.");
    const result = JSON.parse(await native.fingerprintLocalTrack(id));
    if (!result.ok) throw new Error(result.error);
    return result.fingerprint;
  },
  async library() {
    if (!native)
      throw new Error("Local music requires an Android native build.");
    return JSON.parse(await native.localLibrary());
  },
  async scan() {
    if (!native)
      throw new Error("Local music requires an Android native build.");
    await native.scanLocalMusic();
  },
  async mutate(input: Record<string, unknown>) {
    if (!native)
      throw new Error("Local music requires an Android native build.");
    return JSON.parse(await native.mutateLocalMusic(JSON.stringify(input)));
  },
  async path(id: string) {
    if (!native)
      throw new Error("Local music requires an Android native build.");
    return native.localMusicPath(id);
  },
};

export function isEngineAvailable(): boolean {
  try {
    return native?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

export function engineCommand(command: {
  cmd: "status";
}): EngineStatus | EngineError;
export function engineCommand(
  command: Exclude<EngineCommand, { cmd: "status" }>,
): EngineAck | EngineError;
export function engineCommand(
  command: EngineCommand,
): EngineStatus | EngineAck | EngineError {
  if (!native) {
    return { ok: false, error: "engine module not installed" };
  }
  try {
    return JSON.parse(native.command(JSON.stringify(command))) as
      | EngineStatus
      | EngineAck
      | EngineError;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
