import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Button, Skeleton } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import {
  ArrowUpRight,
  Disc3,
  ListMusic,
  Music2,
  Search,
  Users,
  X,
} from "lucide-react";
import { appUrl, client } from "./data";
import {
  normalizeSearch,
  searchSections,
  type SearchItem,
  type SearchScope,
} from "./search";

export const searchOpenAtom = atom(false);

function SearchArtwork({ item }: { item: SearchItem }) {
  const [failed, setFailed] = useState(false);
  const Icon =
    item.kind === "users" || item.kind === "artists"
      ? Users
      : item.kind === "playlists"
        ? ListMusic
        : item.kind === "albums"
          ? Disc3
          : Music2;
  return (
    <span
      className={`search-artwork ${item.kind === "users" || item.kind === "artists" ? "search-artwork-round" : ""}`}
    >
      {item.image && !failed ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon size={21} aria-hidden="true" />
      )}
    </span>
  );
}

function SearchPalette() {
  const [, setOpen] = useAtom(searchOpenAtom);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const trimmed = query.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(trimmed), 300);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const search = useQuery({
    queryKey: ["landing", "search", debounced],
    queryFn: async () =>
      normalizeSearch(await client.search(debounced), appUrl),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const waiting =
    trimmed.length >= 2 && (trimmed !== debounced || search.isPending);
  const sections = useMemo(
    () =>
      searchSections
        .filter((section) => scope === "all" || scope === section.key)
        .map((section) => ({
          ...section,
          items: (search.data ?? []).filter(
            (item) => item.kind === section.key,
          ),
        }))
        .filter((section) => section.items.length > 0),
    [search.data, scope],
  );
  const flat = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  const ready =
    trimmed.length >= 2 &&
    trimmed === debounced &&
    !search.isPending &&
    !search.isError;
  const selected = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => setActive(0), [flat]);
  useEffect(() => {
    if (ready) rows.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected, ready]);

  function openResult(item: SearchItem | undefined) {
    if (!item || !ready) return;
    setOpen(false);
    window.location.assign(item.href);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !ready || !flat.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((selected + delta + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openResult(flat[selected]);
    }
  }

  let index = -1;
  return (
    <>
      <div className="search-input-row">
        <Search size={23} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-label="Search Rocksky"
          aria-autocomplete="list"
          aria-expanded={ready && flat.length > 0}
          aria-controls="rocksky-search-results"
          aria-activedescendant={
            ready && flat.length ? `search-result-${selected}` : undefined
          }
          placeholder="Search Rocksky…"
          value={query}
          maxLength={200}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {query && (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Clear search"
            onPress={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <X size={16} />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="search-close"
          aria-label="Close search"
          onPress={() => setOpen(false)}
        >
          esc
        </Button>
      </div>
      <div className="search-filter-row">
        <span id="search-filter-label">Search in</span>
        <select
          aria-labelledby="search-filter-label"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as SearchScope);
            setActive(0);
            input.current?.focus();
          }}
        >
          <option value="all">Everything</option>
          {searchSections.map((section) => (
            <option value={section.key} key={section.key}>
              {section.label}
            </option>
          ))}
        </select>
        <span className="search-provider">ROCKSKY SEARCH</span>
      </div>
      <div className="search-scroll">
        {trimmed.length < 2 ? (
          <div className="search-message">
            <span className="search-message-icon">
              <Search size={27} />
            </span>
            <h2>Search Rocksky</h2>
            <p>
              Search songs, artists, albums, playlists, and people.
              <br />
              Type at least two characters to get started.
            </p>
          </div>
        ) : search.fetchStatus === "paused" && trimmed === debounced ? (
          <div className="search-message" role="status">
            <h2>You’re offline.</h2>
            <p>Search will resume when your connection returns.</p>
          </div>
        ) : waiting ? (
          <div
            className="search-loading"
            role="status"
            aria-label="Searching Rocksky"
            aria-busy="true"
          >
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-row" key={i}>
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-2/5 rounded-lg" />
                <Skeleton className="ml-auto h-4 w-12 rounded-lg" />
              </div>
            ))}
          </div>
        ) : search.isError ? (
          <div className="search-message" role="status">
            <h2>Couldn’t load search results.</h2>
            <p>Please try again in a moment.</p>
            <Button variant="outline" onPress={() => void search.refetch()}>
              Try again
            </Button>
          </div>
        ) : flat.length === 0 ? (
          <div className="search-message" role="status">
            <h2>
              No matches
              {scope !== "all"
                ? ` in ${searchSections.find((section) => section.key === scope)?.label.toLowerCase()}`
                : ""}
              .
            </h2>
            <p>
              Nothing found for “{trimmed}”.
              <br />
              Try another name or search Everything.
            </p>
          </div>
        ) : null}
        <div
          id="rocksky-search-results"
          role="listbox"
          aria-label="Search results"
          hidden={!ready || flat.length === 0}
        >
          {ready &&
            sections.map((section) => (
              <div
                role="group"
                aria-labelledby={`search-group-${section.key}`}
                key={section.key}
              >
                <div
                  className="search-group-label"
                  id={`search-group-${section.key}`}
                >
                  {section.label}
                  <span>{section.items.length}</span>
                </div>
                {section.items.map((item) => {
                  const rowIndex = ++index;
                  return (
                    <div
                      id={`search-result-${rowIndex}`}
                      key={item.id}
                      role="option"
                      aria-selected={rowIndex === selected}
                      className="search-result"
                      ref={(element) => {
                        rows.current[rowIndex] = element;
                      }}
                      onPointerMove={() => setActive(rowIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openResult(item)}
                    >
                      <SearchArtwork item={item} />
                      <span className="search-result-copy">
                        <strong>{item.title}</strong>
                        {item.subtitle && <span>{item.subtitle}</span>}
                      </span>
                      <span className="search-kind">{section.singular}</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {ready
          ? `${flat.length} results. Use up and down arrows to choose a result, and Enter to open it.`
          : ""}
      </div>
      <div className="search-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Navigate
        </span>
        <span>
          <kbd>↵</kbd> Open
        </span>
        <span>
          <kbd>esc</kbd> Close
        </span>
        <span className="search-footer-note">
          Songs, albums, artists & people
        </span>
      </div>
    </>
  );
}

export default function SearchModal() {
  const [open, setOpen] = useAtom(searchOpenAtom);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]',
      );
      if (event.isComposing || event.repeat) return;
      const command =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !editing;
      if (command || slash) {
        event.preventDefault();
        setOpen((current) => (command ? !current : true));
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    element?.querySelector("input")?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label="Search Rocksky"
      onCancel={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            setOpen(false);
        }
      }}
    >
      {open && <SearchPalette />}
    </dialog>
  );
}
