import styled from "@emotion/styled";
import { IconCarouselHorizontal } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAtom, useSetAtom } from "jotai";
import { coverFlowOpenAtom } from "../../atoms/coverFlow";
import { coverArtUrlOf, type NavidromeAlbum } from "../../api/navidrome";
import AlbumArt from "../../components/AlbumArt";
import { useNavidromeAlbumsQuery } from "../../hooks/useNavidrome";

const Launch = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  padding: 8px 12px;
  background: var(--color-menu-hover);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  &:hover { background: color-mix(in srgb, var(--color-primary) 15%, transparent); }
  kbd { opacity: 0.55; font-size: 11px; }
  @media (max-width: 600px) { kbd { display: none; } }
`;

const Screen = styled.dialog`
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  outline: none;
  background: radial-gradient(ellipse at 50% 38%, #222228 0%, #09090b 55%, #000 100%);
  color: white;
  touch-action: none;
  overscroll-behavior: none;
  &::backdrop { background: #000; }
`;

const Stage = styled.div`
  --cover-size: min(42vw, 49dvh, 480px);
  position: absolute;
  inset: 0;
  perspective: 1400px;
  @media (max-width: 600px) { --cover-size: min(64vw, 46dvh); }
`;

const Cover = styled.button`
  position: absolute;
  left: 50%;
  top: 43%;
  width: var(--cover-size);
  height: var(--cover-size);
  padding: 0;
  border: 0;
  background: #18181b;
  cursor: pointer;
  outline-offset: 6px;
  transition: transform 420ms cubic-bezier(.2,.75,.2,1), filter 420ms, opacity 420ms;
  will-change: transform;
  box-shadow: 0 18px 55px #0009;
  img { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .reflection {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    transform: scaleY(-1);
    opacity: 0.24;
    mask-image: linear-gradient(to top, #0009, transparent 65%);
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Caption = styled.div`
  position: absolute;
  top: calc(43% + var(--cover-size) / 2 + 32px);
  left: 15%;
  right: 15%;
  text-align: center;
  pointer-events: none;
  text-shadow: 0 2px 12px #000;
  h2 { margin: 0; font-size: clamp(16px, 2vw, 25px); font-weight: 600; }
  p { margin: 8px 0 0; color: #aaa; font-size: 14px; }
`;

const Hint = styled.p`
  position: absolute;
  bottom: max(20px, env(safe-area-inset-bottom));
  left: 20px;
  right: 20px;
  margin: 0;
  text-align: center;
  color: #777;
  font-size: 12px;
  button {
    padding: 4px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button:hover, button:focus-visible { color: white; }
`;

const SearchField = styled.input`
  position: absolute;
  z-index: 20;
  top: max(24px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  width: min(420px, calc(100% - 48px));
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid #ffffff30;
  border-radius: 12px;
  background: #18181bee;
  color: white;
  font: inherit;
  outline: none;
  touch-action: auto;
  &::placeholder { color: #999; }
  &:focus { border-color: #ffffff80; }
`;

interface Props {
  albums: NavidromeAlbum[];
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  fetchingMore: boolean;
  loadMore: () => unknown;
  retry: () => unknown;
  onSelect: (id: string) => void;
}

export default function CoverFlow({
  albums: libraryAlbums,
  loading: libraryLoading,
  failed: libraryFailed,
  hasMore: libraryHasMore,
  fetchingMore: libraryFetchingMore,
  loadMore: libraryLoadMore,
  retry: libraryRetry,
  onSelect,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const lastWheel = useRef(0);
  const [open, setOpen] = useAtom(coverFlowOpenAtom);
  const [index, setIndex] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const searchResults = useNavidromeAlbumsQuery(searchQuery || undefined);
  const searching = searchText.trim().length > 0;
  const searchPending =
    searching &&
    (searchText.trim() !== searchQuery || searchResults.isPlaceholderData);
  const matchingAlbums = useMemo(() => {
    const seen = new Set<string>();
    return (searchResults.data?.pages.flat() ?? []).filter((album) => {
      if (seen.has(album.id)) return false;
      seen.add(album.id);
      return true;
    });
  }, [searchResults.data]);
  const albums = searching
    ? searchPending
      ? []
      : matchingAlbums
    : libraryAlbums;
  const loading = searching
    ? searchPending || searchResults.isLoading
    : libraryLoading;
  const failed = searching
    ? !searchPending && searchResults.isError
    : libraryFailed;
  const hasMore = searching
    ? !searchPending && searchResults.hasNextPage
    : libraryHasMore;
  const fetchingMore = searching
    ? searchResults.isFetchingNextPage
    : libraryFetchingMore;
  const loadMore = searching ? searchResults.fetchNextPage : libraryLoadMore;
  const retry = searching ? searchResults.refetch : libraryRetry;
  const activeIndex = Math.min(index, Math.max(0, albums.length - 1));
  const selected = albums[activeIndex];

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSearchQuery(searchText.trim()),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (open && searchVisible) searchInput.current?.focus();
  }, [open, searchVisible]);

  const showSearch = useCallback(() => {
    setSearchVisible(true);
    searchInput.current?.focus();
  }, []);

  const close = useCallback(() => {
    dialog.current?.close();
    setOpen(false);
    setSearchVisible(false);
    setSearchText("");
    setSearchQuery("");
    setIndex(0);
    previousFocus.current?.focus({ preventScroll: true });
  }, [setOpen]);

  const launch = useCallback(() => setOpen(true), [setOpen]);

  useEffect(() => {
    const screen = dialog.current;
    if (!open || !screen) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    screen.showModal();
    return () => {
      screen.close();
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const move = useCallback(
    (delta: number) => {
      setIndex(Math.max(0, Math.min(albums.length - 1, activeIndex + delta)));
    },
    [activeIndex, albums.length],
  );

  const select = useCallback(
    (album: NavidromeAlbum) => {
      close();
      onSelect(album.id);
    },
    [close, onSelect],
  );

  useEffect(() => {
    if (
      open &&
      hasMore &&
      !fetchingMore &&
      !failed &&
      activeIndex >= albums.length - 8
    )
      loadMore();
  }, [
    open,
    hasMore,
    fetchingMore,
    failed,
    activeIndex,
    albums.length,
    loadMore,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="dialog"], dialog',
          )
        )
          return;
        if (document.querySelector('[aria-modal="true"], dialog[open]')) return;
        if (
          event.key.toLowerCase() !== "f" ||
          !event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.repeat
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        launch();
        return;
      }
      // The modal owns the keyboard, including the arrows normally used to seek.
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.isComposing) return;
      const typing = event.target === searchInput.current;
      if (
        event.key === "/" &&
        !typing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        showSearch();
        return;
      }
      if (
        typing &&
        event.key !== "Enter" &&
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp"
      )
        return;
      if (
        ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        move(event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        setIndex(0);
      }
      if (
        event.key === "Enter" &&
        selected &&
        !event.repeat &&
        !(
          event.target instanceof HTMLButtonElement &&
          event.target.dataset.control
        )
      ) {
        event.preventDefault();
        select(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, launch, close, move, selected, select, showSearch]);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      {createPortal(
        <Screen
          ref={dialog}
          aria-label="Album Cover Flow"
          aria-describedby="cover-flow-hint"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onWheel={(event) => {
            const delta =
              Math.abs(event.deltaX) > Math.abs(event.deltaY)
                ? event.deltaX
                : event.deltaY;
            if (Math.abs(delta) < 8 || Date.now() - lastWheel.current < 180)
              return;
            lastWheel.current = Date.now();
            move(delta > 0 ? 1 : -1);
          }}
          onPointerDown={(event) => {
            if (event.target instanceof HTMLInputElement) return;
            gesture.current = { x: event.clientX, y: event.clientY };
            swiped.current = false;
          }}
          onPointerUp={(event) => {
            if (!gesture.current) return;
            const delta = event.clientX - gesture.current.x;
            if (
              Math.abs(delta) > 35 &&
              Math.abs(delta) > Math.abs(event.clientY - gesture.current.y)
            ) {
              swiped.current = true;
              move(delta < 0 ? 1 : -1);
            }
            gesture.current = null;
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
        >
          {open && (
            <Stage>
              {searchVisible && (
                <SearchField
                  ref={searchInput}
                  type="search"
                  aria-label="Search albums in Cover Flow"
                  placeholder="Search albums…"
                  value={searchText}
                  autoComplete="off"
                  onChange={(event) => {
                    setSearchText(event.target.value);
                    setIndex(0);
                  }}
                />
              )}
              {albums
                .slice(Math.max(0, activeIndex - 6), activeIndex + 7)
                .map((album, localIndex) => {
                  const offset =
                    Math.max(0, activeIndex - 6) + localIndex - activeIndex;
                  const distance = Math.abs(offset);
                  const x =
                    offset === 0
                      ? 0
                      : Math.sign(offset) * (0.78 + (distance - 1) * 0.31);
                  return (
                    <Cover
                      key={album.id}
                      type="button"
                      tabIndex={offset === 0 ? 0 : -1}
                      aria-label={`Open ${album.name} by ${album.artist}`}
                      aria-current={offset === 0 ? "true" : undefined}
                      onClick={() => {
                        if (!swiped.current) select(album);
                      }}
                      style={{
                        transform: `translate(-50%, -50%) translateX(calc(var(--cover-size) * ${x})) translateZ(${offset === 0 ? 80 : -distance * 35}px) rotateY(${offset === 0 ? 0 : -Math.sign(offset) * 58}deg)`,
                        zIndex: 10 - distance,
                        filter: `brightness(${offset === 0 ? 1 : 0.65})`,
                        opacity: distance > 5 ? 0 : 1,
                        pointerEvents: distance > 5 ? "none" : "auto",
                      }}
                    >
                      <AlbumArt
                        src={coverArtUrlOf(album)}
                        alt=""
                        draggable={false}
                      />
                      <AlbumArt
                        className="reflection"
                        src={coverArtUrlOf(album)}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                      />
                    </Cover>
                  );
                })}
              <Caption aria-live="polite" aria-atomic="true">
                {selected ? (
                  <>
                    <h2>{selected.name}</h2>
                    <p>{selected.artist}</p>
                  </>
                ) : (
                  <h2>
                    {failed
                      ? "Couldn’t load your albums"
                      : loading
                        ? "Loading albums…"
                        : searching
                          ? "No matching albums"
                          : "No albums to browse"}
                  </h2>
                )}
                {failed && (
                  <button
                    type="button"
                    data-control="true"
                    style={{ pointerEvents: "auto" }}
                    onClick={() => retry()}
                  >
                    Retry loading albums
                  </button>
                )}
              </Caption>
              <Hint id="cover-flow-hint">
                <button type="button" data-control="true" onClick={showSearch}>
                  / to search
                </button>{" "}
                · {searchVisible ? "↑ ↓ to browse · " : ""}← → / swipe / scroll
                to browse · Enter / click to open ·{" "}
                <button type="button" data-control="true" onClick={close}>
                  Esc to exit
                </button>
                {fetchingMore ? " · Loading more…" : ""}
              </Hint>
            </Stage>
          )}
        </Screen>,
        document.body,
      )}
    </>
  );
}

export function CoverFlowButton() {
  const setOpen = useSetAtom(coverFlowOpenAtom);
  return (
    <Launch
      type="button"
      onClick={() => setOpen(true)}
      title="Cover Flow (Shift+F)"
      aria-keyshortcuts="Shift+F"
    >
      <IconCarouselHorizontal size={17} /> Cover Flow <kbd>⇧ F</kbd>
    </Launch>
  );
}
