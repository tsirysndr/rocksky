// The Last.fm "no album art" placeholder. The backend already coerces
// null/undefined art to this before persisting; the runtime fallback below
// covers the other case — a URL that is present but dead.
export const PLACEHOLDER_ALBUM_ART =
  "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";

const isLastFmImage = (src: string) => {
  try {
    return new URL(src, location.href).hostname.includes("lastfm");
  } catch {
    return false;
  }
};

/**
 * Swaps any Last.fm image that fails to load for the placeholder, app-wide.
 *
 * Last.fm's CDN 404s on art it no longer serves (dead hashes, and hosts like
 * `lastfm-img.freetls.fastly.net` that come in with old scrobbles), which
 * otherwise renders as a broken-image icon. Art reaches the DOM through far too
 * many `<img>` tags — plus ones we don't author, inside baseui/HeroUI — to fix
 * one call site at a time, so we listen once on the capture phase: `error`
 * doesn't bubble, but it does capture.
 *
 * Scoped to Last.fm hosts on purpose: a broken avatar or uploaded cover must not
 * turn into a Last.fm star.
 */
export function installAlbumArtFallback() {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.src === PLACEHOLDER_ALBUM_ART || !isLastFmImage(img.src)) return;
      img.removeAttribute("srcset");
      img.src = PLACEHOLDER_ALBUM_ART;
    },
    true,
  );
}
