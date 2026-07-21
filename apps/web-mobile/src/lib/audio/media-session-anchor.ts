import { SILENT_AUDIO_DATA_URI } from "./silence";

// Media Session anchor — a hidden, silent, looping <audio> element kept playing
// while the wasm engine (Web Audio) plays, so the OS / lock-screen media
// controls (Media Session) surface. Web Audio alone doesn't trigger them.
//
// The element is created lazily and owned by THIS module, not React. That's
// deliberate: the mini-player unmounts its DOM when nothing is playing, so a
// React-rendered <audio> doesn't exist yet at the moment of the very first
// play() — and browsers only let <audio>.play() start from inside a user
// gesture. By owning a persistent element here, the click handlers (playNow,
// resume, media-key play) can start it synchronously, in-gesture, every time.

let anchor: HTMLAudioElement | null = null;

function getAnchor(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  if (anchor) return anchor;
  const el = document.createElement("audio");
  el.src = SILENT_AUDIO_DATA_URI;
  el.loop = true;
  el.preload = "auto";
  // The clip is silent audio content (inaudible), so no need to mute — a
  // zero-volume element can stop some browsers from surfacing Media Session.
  el.setAttribute("aria-hidden", "true");
  el.style.display = "none";
  document.body.appendChild(el);
  anchor = el;
  return anchor;
}

export function playMediaAnchor(): void {
  // Touch the element synchronously so play() lands inside the gesture.
  getAnchor()?.play().catch(() => {
    // Autoplay policy or no gesture — nothing we can do; ignore.
  });
}

export function pauseMediaAnchor(): void {
  anchor?.pause();
}
