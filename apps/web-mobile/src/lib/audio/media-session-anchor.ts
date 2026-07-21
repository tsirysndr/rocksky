// Media Session anchor — a hidden, silent <audio> element kept playing while
// the wasm engine (Web Audio) plays, so the OS / lock-screen media controls
// surface. Web Audio alone doesn't trigger Media Session.
//
// The catch: browsers only let <audio>.play() start from a user gesture. React
// effects that react to state run AFTER the gesture, so play() there is rejected
// by the autoplay policy and the anchor never starts. These helpers let the
// click handlers (playNow, resume, media-key play) start the anchor
// synchronously, inside the gesture.

let anchor: HTMLAudioElement | null = null;

export function registerMediaAnchor(el: HTMLAudioElement | null): void {
  anchor = el;
}

export function playMediaAnchor(): void {
  anchor?.play().catch(() => {
    // Autoplay policy or no gesture — nothing we can do; ignore.
  });
}

export function pauseMediaAnchor(): void {
  anchor?.pause();
}
