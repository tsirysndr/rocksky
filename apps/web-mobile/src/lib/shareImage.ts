import { toPng } from "html-to-image";
import { API_URL } from "../consts";

const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

export async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(
    `${API_URL}/proxy-image?url=${encodeURIComponent(url)}`,
  );
  if (!res.ok) throw new Error(`proxy-image failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Inline remote images as data URLs: html-to-image can't read cross-origin
 * pixels, so a capture would otherwise come out with blank artwork. */
export async function resolveImages(
  urls: (string | undefined | null)[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const unique = [
    ...new Set(
      urls.filter((u): u is string => !!u && !u.endsWith("/@jpeg")),
    ),
  ];
  await Promise.all(
    unique.map((url) =>
      fetchAsBase64(url)
        .then((b64) => {
          map[url] = b64;
        })
        .catch(() => {}),
    ),
  );
  return map;
}

export async function downloadNodeAsPng(node: HTMLElement, filename: string) {
  await document.fonts.ready;
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    skipFonts: true,
    imagePlaceholder: TRANSPARENT_PIXEL,
  });
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
