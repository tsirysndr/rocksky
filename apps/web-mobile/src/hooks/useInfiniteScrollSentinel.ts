import { useEffect, useState } from "react";

// Callback-ref sentinel: the node is held in state so it is a dependency of the
// effect, and the observer (re)attaches whenever the sentinel mounts — a tab
// mounted lazily after a switch, or a feed whose sentinel is gated behind a
// second, unrelated query. With a ref the effect wouldn't re-run for the node,
// and scrolling would stop loading more.
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
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return setEl;
}
