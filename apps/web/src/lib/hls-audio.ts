import Hls from "hls.js";
import { useEffect, useState } from "react";

export interface HlsAudioState {
  attached: boolean;
  url: string | null;
  playing: boolean;
  volume: number;
  muted: boolean;
}

export class HlsAudioController {
  private audio: HTMLAudioElement;
  private hls: Hls | null = null;
  private currentUrl: string | null = null;
  private volume = 1.0;
  private muted = false;
  private listeners = new Set<(state: HlsAudioState) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "none";
    this.audio.crossOrigin = "anonymous";
    this.audio.setAttribute("data-rockbox-hls", "1");
    this.audio.style.display = "none";
    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(this.audio);
    }
    this.audio.addEventListener("play", () => this.emit());
    this.audio.addEventListener("pause", () => this.emit());
    this.audio.addEventListener("ended", () => {
      this.emit();
      // Schedule a reattach so the stream recovers automatically when
      // rockbox starts the next track and new HLS segments appear.
      this.scheduleReattach(2000);
    });
    this.audio.addEventListener("volumechange", () => {
      this.volume = this.audio.volume;
      this.muted = this.audio.muted;
      this.emit();
    });
  }

  attach(url: string) {
    if (this.currentUrl === url && this.hls !== null) return;
    this.detach();
    this.currentUrl = url;

    if (Hls.isSupported()) {
      this.hls = new Hls({
        liveSyncDuration: 4,
        liveMaxLatencyDuration: 8,
        backBufferLength: 30,
      });
      this.hls.loadSource(url);
      this.hls.attachMedia(this.audio);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.tryAutoplay();
      });
      this.hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            this.hls?.recoverMediaError();
            return;
          } catch {
            // fall through to reattach
          }
        }
        this.scheduleReattach();
      });
    } else if (this.audio.canPlayType("application/vnd.apple.mpegurl")) {
      this.audio.src = url;
      this.tryAutoplay();
    }
    this.emit();
  }

  detach() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (!this.audio.paused) this.audio.pause();
    this.audio.removeAttribute("src");
    this.currentUrl = null;
    this.emit();
  }

  private scheduleReattach(delayMs = 1500) {
    if (this.retryTimer !== null || !this.currentUrl) return;
    const url = this.currentUrl;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.detach();
      this.attach(url);
    }, delayMs);
  }

  pause() {
    if (!this.audio.paused) this.audio.pause();
  }

  resume() {
    if (this.audio.muted) this.audio.muted = false;
    // After a track ends the audio element is in a terminal state. For hls.js,
    // reset the load position to the live edge and call play() in the same
    // tick so the browser's user-gesture context is preserved (detach+reattach
    // loses it because MANIFEST_PARSED fires across async ticks).
    if (this.audio.ended && this.hls) {
      this.hls.stopLoad();
      this.hls.startLoad(-1); // -1 = live edge
      this.audio.play().catch((e) => console.warn("[hls-audio] resume blocked:", e));
      return;
    }
    // Fallback for native Safari HLS path (no hls.js instance).
    if (this.audio.ended && this.currentUrl) {
      this.audio.load();
      this.audio.play().catch((e) => console.warn("[hls-audio] resume blocked:", e));
      return;
    }
    this.seekToLiveEdge();
    this.audio.play().catch((e) => console.warn("[hls-audio] resume blocked:", e));
  }

  private seekToLiveEdge() {
    if (!this.hls) return;
    const pos = this.hls.liveSyncPosition;
    if (typeof pos !== "number" || isNaN(pos) || pos <= 0) return;
    if (this.audio.currentTime >= pos) return;
    try {
      this.audio.currentTime = pos;
    } catch {
      // hls.js will handle buffering
    }
  }

  private tryAutoplay() {
    this.audio.play().catch(() => {
      this.audio.muted = true;
      this.audio.play().catch((e) => console.warn("[hls-audio] muted autoplay blocked:", e));
    });
  }

  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    this.audio.volume = clamped;
    if (clamped > 0 && this.audio.muted) this.audio.muted = false;
    if (this.audio.paused && this.currentUrl) {
      this.seekToLiveEdge();
      this.audio.play().catch(() => {});
    }
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
  }

  state(): HlsAudioState {
    return {
      attached: this.currentUrl !== null,
      url: this.currentUrl,
      playing: !this.audio.paused && !this.audio.ended,
      volume: this.volume,
      muted: this.muted,
    };
  }

  subscribe(fn: (state: HlsAudioState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.state();
    this.listeners.forEach((fn) => fn(s));
  }
}

export const hlsAudio = new HlsAudioController();

export function useHlsAudio(): HlsAudioState {
  const [state, setState] = useState<HlsAudioState>(hlsAudio.state());
  useEffect(() => hlsAudio.subscribe(setState), []);
  return state;
}
