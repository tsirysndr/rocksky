import type { RemoteAudioSettings } from "@rocksky/sdk";
import { requireOptionalNativeModule } from "expo";

type RockskyEngineNativeModule = {
  sharePost(json: string): Promise<boolean>;
  mediaRenderer(json: string): Promise<string>;
  rendererArtwork(url: string): Promise<string>;
  remoteLibrary(json: string): Promise<string>;
  localLibrary(): Promise<string>;
  scanLocalMusic(): Promise<void>;
  mutateLocalMusic(json: string): Promise<string>;
  localMusicPath(id: string): Promise<string>;
  fingerprintLocalTrack(id: string): Promise<string>;
  prepareLocalMusicUpload(id: string): Promise<string>;
  releaseLocalMusicUpload(uri: string): Promise<void>;
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
  rendererTrack?: RendererTrack;
};

export type EngineAck = { ok: true };
export type EngineError = { ok: false; error: string };

export type EngineCommand =
  | { cmd: "rendererRelease" }
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
  async prepareUpload(
    id: string,
  ): Promise<{ uri: string; name: string; mimeType: string }> {
    if (!native)
      throw new Error("Local music requires an Android native build.");
    return JSON.parse(await native.prepareLocalMusicUpload(id));
  },
  async releaseUpload(uri: string) {
    if (native) await native.releaseLocalMusicUpload(uri);
  },
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

export async function remoteLibraryRequest<T>(
  request: Record<string, unknown>,
): Promise<T> {
  if (!native)
    throw new Error("Server libraries require a native Android build.");
  const result = JSON.parse(
    await native.remoteLibrary(JSON.stringify(request)),
  );
  if (!result.ok) throw new Error(result.error || "Library request failed");
  return result as T;
}

export type RendererTrack = {
  uri: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
  generation: number;
};
export type RendererStatus = {
  enabled: boolean;
  running: boolean;
  name: string;
  location: string | null;
  error: string | null;
  track?: RendererTrack | null;
};
export const mediaRenderer = {
  async request(input: { action?: "status"; enabled?: boolean } = {}): Promise<RendererStatus> {
    if (!native) throw new Error("Media receiver requires an Android native build.");
    return JSON.parse(await native.mediaRenderer(JSON.stringify(input)));
  },
  async extractArtwork(url: string): Promise<string | null> {
    if (!native) return null;
    const result = JSON.parse(await native.rendererArtwork(url));
    return result.ok && typeof result.albumArt === "string"
      ? result.albumArt
      : null;
  },
};

export async function sharePost(input: {
  text: string;
  title: string;
  imageUri?: string;
  target?: "Bluesky" | "X" | "Facebook";
}): Promise<boolean> {
  if (!native?.sharePost) throw new Error("Sharing posts requires an updated Android build.");
  return native.sharePost(JSON.stringify(input));
}
