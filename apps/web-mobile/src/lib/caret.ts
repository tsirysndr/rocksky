/**
 * Pixel coordinates of the caret within a textarea, relative to the element's
 * own top-left (padding box). Used to anchor the @-mention popup right under the
 * text being typed instead of at the bottom of the whole field.
 *
 * Works by rendering an invisible "mirror" div that copies the textarea's text
 * and relevant styles, then measuring a marker placed at the caret offset.
 */
const MIRRORED_PROPS = [
  "boxSizing",
  "width",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "textTransform",
  "wordSpacing",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "whiteSpace",
  "wordWrap",
  "tabSize",
] as const;

export interface CaretCoords {
  /** Offset from the textarea's top edge to the top of the caret line. */
  top: number;
  /** Offset from the textarea's left edge to the caret. */
  left: number;
  /** Line height at the caret. */
  height: number;
}

export function getCaretCoordinates(
  el: HTMLTextAreaElement,
  position: number,
): CaretCoords {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  for (const prop of MIRRORED_PROPS) {
    mirror.style[prop as never] = style[prop as never];
  }
  // Overflow must not add scrollbars that shift metrics.
  mirror.style.overflow = "hidden";

  mirror.textContent = el.value.slice(0, position);
  // A marker span at the caret; its offset is the caret position.
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop - el.scrollTop;
  const left = marker.offsetLeft - el.scrollLeft;
  const height =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  document.body.removeChild(mirror);

  return { top, left, height };
}
