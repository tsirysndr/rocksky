import { useState, type ImgHTMLAttributes } from "react";

import { PLACEHOLDER_ALBUM_ART } from "../lib/albumArt";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
};

/**
 * An <img> that always renders working album art: it uses the placeholder when
 * `src` is missing, and swaps to the placeholder if the real URL fails to load.
 *
 * We do NOT pre-validate the URL (a HEAD/`new Image()` probe is a wasted
 * round-trip, CORS-restricted, and racy) — the browser fetches the image anyway,
 * so we simply react to `onError`. `failedSrc` is keyed to the specific URL, so
 * a new `src` is retried and the placeholder failing on itself can't loop.
 */
export default function AlbumArt({ src, alt = "", onError, ...rest }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = !src || failedSrc === src;
  return (
    <img
      src={broken ? PLACEHOLDER_ALBUM_ART : src}
      alt={alt}
      onError={(e) => {
        if (src) setFailedSrc(src);
        onError?.(e);
      }}
      {...rest}
    />
  );
}
