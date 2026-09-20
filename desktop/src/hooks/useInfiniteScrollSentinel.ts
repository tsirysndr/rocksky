import { useEffect, useState } from "react";

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el?.parentElement ?? null;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

// The node is held in state, not a ref, so that it is a dependency of the
// effect. A sentinel that mounts later than the query flags it is keyed on —
// a baseui tab panel opened after its query settled, or a feed whose sentinel
// is gated behind a second, unrelated query — would otherwise never be
// observed: the effect re-runs only when a dependency changes, and with a ref
// the node isn't one. Either way scrolling stopped loading more.
export function useInfiniteScrollSentinel(
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => unknown,
) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: getScrollParent(el), rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return setEl;
}
