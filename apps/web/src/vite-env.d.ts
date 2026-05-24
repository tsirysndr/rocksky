/// <reference types="vite/client" />

declare module "audio-type" {
  type AudioFormat = "mp3" | "wav" | "flac" | "aac" | "m4a" | "oga" | "opus" | "webm" | "aiff" | "caf" | "qoa" | "mid" | "wma" | "amr";
  export default function audioType(buf: Uint8Array | ArrayBuffer): AudioFormat | undefined;
}
