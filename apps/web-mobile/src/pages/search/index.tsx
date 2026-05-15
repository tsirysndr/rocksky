import { IconSearch } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Main from "../../layouts/Main";
import { search } from "../../api/search";

function ResultItem({ item }: { item: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indexUid = (item._federation as any)?.indexUid as string;
  const cover = (item.albumArt || item.cover || item.picture || item.avatar) as string;
  const title = (item.displayName || item.title || item.name) as string;
  const subtitle =
    indexUid === "users"
      ? (`@${item.handle}` as string)
      : indexUid === "artists"
        ? "Artist"
        : indexUid === "albums"
          ? "Album"
          : "Track";
  const uri = item.uri as string;

  const href = uri
    ? `/${uri.split("at://")[1].replace("app.rocksky.", "")}`
    : item.did
      ? `/profile/${item.handle || item.did}`
      : null;

  const isRound = indexUid === "artists" || indexUid === "users";

  const content = (
    <div className="flex items-center gap-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      <div
        className={`w-12 h-12 shrink-0 overflow-hidden ${isRound ? "rounded-full" : "rounded-lg"}`}
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xl opacity-20">{indexUid === "artists" ? "♬" : "♪"}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{title}</p>
        {subtitle && (
          <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{subtitle}</p>
        )}
      </div>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full shrink-0 capitalize"
        style={{ backgroundColor: "var(--color-surface-3, var(--color-surface-2))", color: "var(--color-text-muted)" }}
      >
        {indexUid === "users" ? "user" : indexUid === "artists" ? "artist" : indexUid === "albums" ? "album" : "track"}
      </span>
    </div>
  );

  return href ? (
    <Link to={href} className="no-underline block">{content}</Link>
  ) : (
    content
  );
}

export default function Search() {
  const [query, setQuery] = useState("");
  const { mutate, data, isPending, reset } = useMutation({
    mutationFn: search,
  });

  const debounceRef = useRef<number | null>(null);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { reset(); return; }
    mutate(q.trim());
  }, [mutate, reset]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) { reset(); return; }
    debounceRef.current = window.setTimeout(() => doSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch, reset]);

  const results: Record<string, unknown>[] = data?.hits || [];

  return (
    <Main>
      <div className="pt-4 pb-6">
        <h1 className="px-4 text-2xl font-bold m-0 mb-4" style={{ color: "var(--color-text)" }}>
          Search
        </h1>

        {/* Search bar */}
        <div className="px-4 mb-4">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ backgroundColor: "var(--color-surface-2)" }}
          >
            <IconSearch size={18} color="var(--color-text-muted)" />
            <input
              type="search"
              placeholder="Songs, artists, albums..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
              autoComplete="off"
              className="flex-1 border-none bg-transparent text-base outline-none"
              style={{ color: "var(--color-text)" }}
            />
            {query && (
              <button
                onClick={() => { setQuery(""); reset(); }}
                className="border-none bg-transparent cursor-pointer p-0 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {isPending && (
          <div className="flex justify-center py-12">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {!isPending && results.length === 0 && data !== undefined && query && (
          <div className="flex flex-col items-center py-16 px-8 text-center">
            <span className="text-5xl mb-3 opacity-20">🔍</span>
            <p className="text-sm m-0" style={{ color: "var(--color-text-muted)" }}>
              No results for "{query}"
            </p>
          </div>
        )}

        {!isPending && !query && (
          <div className="flex flex-col items-center py-16 px-8 text-center">
            <span className="text-5xl mb-3 opacity-20">🎵</span>
            <p className="text-sm m-0" style={{ color: "var(--color-text-muted)" }}>
              Search for songs, artists, and albums
            </p>
          </div>
        )}

        {!isPending && results.length > 0 && (
          <div className="px-4">
            {results.map((item, i) => (
              <ResultItem key={String(item.id || i)} item={item} />
            ))}
          </div>
        )}
      </div>
    </Main>
  );
}
