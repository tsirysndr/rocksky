/**
 * Raycast-style command-palette search for the web app. Opened by clicking the
 * sidebar search field or pressing "/" (see components/KeyboardShortcuts),
 * mounted once globally from the root route. Replaces the old inline search
 * popover. Web only — web-mobile keeps its own search.
 */
import styled from "@emotion/styled";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { useNavigate } from "@tanstack/react-router";
import { IconUser } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchModalOpenAtom,
  searchModalScopeAtom,
  type SearchScope,
} from "../../atoms/searchModal";
import Artist from "../../components/Icons/Artist";
import Disc from "../../components/Icons/Disc";
import Playlist from "../../components/Icons/Playlist";
import Track from "../../components/Icons/Track";
import { useSearchMutation } from "../../hooks/useSearch";
import {
  isAlbumHit,
  isArtistHit,
  isPlaylistHit,
  isTrackHit,
  isUserHit,
  type SearchHit,
  type SearchIndex,
} from "../../types/search";

// ── Result model ────────────────────────────────────────────────────────────

type Art = { url: string | null; round: boolean; kind: SearchIndex };

type NavItem = {
  id: string;
  index: SearchIndex;
  href: string;
  primary: string;
  secondary: string | null;
  secondaryMono: boolean;
  typeLabel: string;
  art: Art;
};

// A broken/placeholder avatar comes back as a URL ending in "/@jpeg".
const isRealAvatar = (url: string) => !!url && !url.endsWith("/@jpeg");

// Build a display item from a raw hit, resolving its destination path (mirrors
// the app's routing: users → /profile/<handle>; other records →
// /<did>/<type>/<rkey> derived from the AT-URI). Returns null when there's no
// resolvable destination, so it's skipped from the palette.
function toNavItem(hit: SearchHit): NavItem | null {
  if (isUserHit(hit)) {
    if (!hit.handle) return null;
    return {
      id: hit.id,
      index: "users",
      href: `/profile/${hit.handle}`,
      primary: hit.displayName || hit.handle,
      secondary: `@${hit.handle}`,
      secondaryMono: true,
      typeLabel: "User",
      art: {
        url: isRealAvatar(hit.avatar) ? hit.avatar : null,
        round: true,
        kind: "users",
      },
    };
  }

  // Record-backed hits share the AT-URI → path derivation.
  const href = hit.uri
    ? `/${hit.uri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;
  if (!href) return null;

  if (isArtistHit(hit)) {
    return {
      id: hit.id,
      index: "artists",
      href,
      primary: hit.name,
      secondary: null,
      secondaryMono: false,
      typeLabel: "Artist",
      art: { url: hit.picture, round: true, kind: "artists" },
    };
  }
  if (isAlbumHit(hit)) {
    return {
      id: hit.id,
      index: "albums",
      href,
      primary: hit.title,
      secondary: hit.artist,
      secondaryMono: false,
      typeLabel: "Album",
      art: { url: hit.albumArt, round: false, kind: "albums" },
    };
  }
  if (isTrackHit(hit)) {
    return {
      id: hit.id,
      index: "tracks",
      href,
      primary: hit.title,
      secondary: hit.artist,
      secondaryMono: false,
      typeLabel: "Song",
      art: { url: hit.albumArt, round: false, kind: "tracks" },
    };
  }
  if (isPlaylistHit(hit)) {
    return {
      id: hit.id,
      index: "playlists",
      href,
      primary: hit.name,
      secondary: null,
      secondaryMono: false,
      typeLabel: "Playlist",
      art: { url: hit.picture, round: false, kind: "playlists" },
    };
  }
  return null;
}

// Section display order + headings.
const SECTION_ORDER: { index: SearchIndex; label: string }[] = [
  { index: "tracks", label: "Songs" },
  { index: "artists", label: "Artists" },
  { index: "albums", label: "Albums" },
  { index: "playlists", label: "Playlists" },
  { index: "users", label: "People" },
];

// Scope filter shown as a dropdown next to the query (SearchScope from the atom).
const FILTER_OPTIONS: { key: SearchScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tracks", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "playlists", label: "Playlists" },
  { key: "users", label: "People" },
];

// ── Styling ─────────────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
`;

const Panel = styled.div`
  width: 100%;
  max-width: 640px;
  max-height: 66vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
`;

const QueryInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 18px;

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const EscHint = styled.kbd`
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-muted);
  padding: 4px 7px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
`;

const FilterSelect = styled.select`
  flex-shrink: 0;
  font-family: RockfordSansRegular;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-input-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  outline: none;
`;

const Results = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
`;

const SectionLabel = styled.div`
  font-family: RockfordSansBold;
  font-size: 11px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 12px 12px 6px;
`;

const Row = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 9px;
  cursor: pointer;
  background: ${({ active }) =>
    active ? "var(--color-menu-hover)" : "transparent"};
`;

const Thumb = styled.div<{ round?: boolean }>`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: ${({ round }) => (round ? "50%" : "6px")};
  overflow: hidden;
  background: var(--color-skeleton-background);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 22px;
    height: 22px;
  }
`;

const RowText = styled.div`
  min-width: 0;
  flex: 1;
`;

const Primary = styled.div`
  color: var(--color-text);
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Secondary = styled.div<{ mono?: boolean }>`
  color: var(--color-text-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ mono }) => (mono ? "var(--font-mono)" : "inherit")};
`;

const TypeBadge = styled.span`
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 5px;
  padding: 3px 6px;
`;

const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.18);
  color: var(--color-text-muted);
  font-size: 12px;
`;

const FootHint = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 5px;
  }
`;

const ICON_COLOR = "var(--color-text-muted)";

function FallbackIcon({ kind }: { kind: SearchIndex }) {
  switch (kind) {
    case "users":
      return <IconUser size={22} color={ICON_COLOR} />;
    case "artists":
      return <Artist color={ICON_COLOR} />;
    case "albums":
      return <Disc color={ICON_COLOR} width={22} height={22} />;
    case "tracks":
      return <Track color={ICON_COLOR} />;
    case "playlists":
      return <Playlist />;
    default:
      return null;
  }
}

function Artwork({ item }: { item: NavItem }) {
  const { art, primary } = item;
  return (
    <Thumb round={art.round}>
      {art.url ? (
        <img src={art.url} alt={primary} />
      ) : (
        <FallbackIcon kind={art.kind} />
      )}
    </Thumb>
  );
}

// ── Palette (mounted only while open, so it initialises fresh each time) ──────

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  // The palette mounts fresh each open, so this captures the requested scope
  // (set by the trigger/shortcut) at open time.
  const initialScope = useAtomValue(searchModalScopeAtom);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchScope>(initialScope);
  const [active, setActive] = useState(0);
  const { mutate, data, reset } = useSearchMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const debounced = useMemo(
    () => _.debounce((q: string) => mutate(q), 180),
    [mutate],
  );

  useEffect(() => {
    inputRef.current?.focus();
    return () => debounced.cancel();
  }, [debounced]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      debounced.cancel();
      reset();
      return;
    }
    debounced(q);
  }, [query, debounced, reset]);

  // Group navigable hits by section, and keep a parallel flat list for
  // arrow-key navigation (index into `flat` === visual order).
  const { sections, flat } = useMemo(() => {
    const items = (data?.hits ?? [])
      .map(toNavItem)
      .filter((x): x is NavItem => x !== null);
    const byIndex = _.groupBy(items, (it) => it.index);
    const built: { label: string; items: NavItem[] }[] = [];
    const flatList: NavItem[] = [];
    const visible =
      filter === "all"
        ? SECTION_ORDER
        : SECTION_ORDER.filter((s) => s.index === filter);
    for (const section of visible) {
      const group = byIndex[section.index];
      if (group && group.length) {
        built.push({ label: section.label, items: group });
        flatList.push(...group);
      }
    }
    return { sections: built, flat: flatList };
  }, [data, filter]);

  // Reset the highlight to the top whenever the visible result set changes
  // (new query or filter). `flat` is a fresh array each recompute, so its
  // identity is the signal — adjust during render per the React "reset state
  // when a value changes" pattern rather than in an effect.
  const prevFlat = useRef(flat);
  if (prevFlat.current !== flat) {
    prevFlat.current = flat;
    if (active !== 0) setActive(0);
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: NavItem | undefined) => {
    if (!item) return;
    onClose();
    navigate({ to: item.href as string });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  const trimmed = query.trim();
  let flatIndex = -1;

  return (
    <Panel onClick={(e) => e.stopPropagation()}>
      <SearchRow>
        <SearchIcon size={22} color="var(--color-text-muted)" />
        <QueryInput
          ref={inputRef}
          value={query}
          placeholder="Search songs, artists, albums, people…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <FilterSelect
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as SearchScope);
            // Return focus to the query so arrow-key navigation resumes.
            inputRef.current?.focus();
          }}
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>
        <EscHint>esc</EscHint>
      </SearchRow>

      {flat.length > 0 && (
        <Results>
          {sections.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              {section.items.map((item) => {
                flatIndex += 1;
                const idx = flatIndex;
                return (
                  <Row
                    key={item.id}
                    active={idx === active}
                    ref={(el) => {
                      rowRefs.current[idx] = el;
                    }}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => go(item)}
                  >
                    <Artwork item={item} />
                    <RowText>
                      <Primary>{item.primary}</Primary>
                      {item.secondary && (
                        <Secondary mono={item.secondaryMono}>
                          {item.secondary}
                        </Secondary>
                      )}
                    </RowText>
                    <TypeBadge>{item.typeLabel}</TypeBadge>
                  </Row>
                );
              })}
            </div>
          ))}
        </Results>
      )}

      {flat.length === 0 && (
        <Empty>
          {trimmed.length < 2
            ? "Search songs, artists, albums, playlists and people."
            : `No results for “${trimmed}”.`}
        </Empty>
      )}

      <Footer>
        <FootHint>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </FootHint>
        <FootHint>
          <kbd>↵</kbd> open
        </FootHint>
        <FootHint>
          <kbd>esc</kbd> close
        </FootHint>
      </Footer>
    </Panel>
  );
}

function SearchModal() {
  const [open, setOpen] = useAtom(searchModalOpenAtom);

  // Lock background scroll while the palette is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <Overlay onClick={() => setOpen(false)}>
      <Palette onClose={() => setOpen(false)} />
    </Overlay>
  );
}

export default SearchModal;
