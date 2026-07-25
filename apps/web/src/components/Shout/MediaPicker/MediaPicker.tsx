import styled from "@emotion/styled";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  KLIPY_ENABLED,
  KLIPY_TABS,
  searchMedia,
  type KlipyMediaType,
  type MediaResult,
} from "../../../api/klipy";

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 340px;
  max-width: calc(100vw - 32px);
  padding: 12px;
  border-radius: 12px;
  background-color: var(--color-background);
  border: 1px solid var(--color-input-background);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Tabs = styled.div`
  display: flex;
  gap: 4px;
`;

const Tab = styled.button<{ active: boolean }>`
  border: none;
  cursor: pointer;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s ease;
  background-color: ${({ active }) =>
    active ? "var(--color-purple)" : "transparent"};
  color: ${({ active }) =>
    active ? "var(--color-button-text)" : "var(--color-text-muted)"};

  &:hover {
    color: var(--color-text);
  }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  width: 28px;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  background-color: transparent;
  color: var(--color-text-muted);

  &:hover {
    background-color: var(--color-input-background);
    color: var(--color-text);
  }
`;

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 8px;
  background-color: var(--color-input-background);
`;

const SearchInput = styled.input`
  height: 34px;
  width: 100%;
  border: none;
  outline: none;
  background-color: transparent;
  font-size: 14px;
  color: var(--color-text);

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  height: 300px;
  align-content: start;
  overflow-y: auto;
`;

const Tile = styled.button`
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--color-input-background);
  cursor: pointer;
  padding: 0;
  background-color: var(--color-input-background);
  transition: transform 0.12s ease;

  &:hover {
    transform: scale(1.03);
    border-color: var(--color-purple);
  }

  & > img,
  & > video {
    height: 100%;
    width: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Empty = styled.div`
  grid-column: span 3;
  padding: 32px 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
`;

const Credit = styled.p`
  margin: 0;
  text-align: center;
  font-size: 10px;
  color: var(--color-text-muted);
`;

/** Debounce a fast-changing value. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface MediaPickerProps {
  onSelect: (media: MediaResult) => void;
  onClose: () => void;
}

/** KLIPY-powered GIF / sticker / clip picker. */
function MediaPicker({ onSelect, onClose }: MediaPickerProps) {
  const [type, setType] = useState<KlipyMediaType>("gifs");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 350);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["klipy", type, debounced],
    queryFn: () => searchMedia(type, debounced),
    enabled: KLIPY_ENABLED,
    staleTime: 60_000,
  });

  const results = data ?? [];

  return (
    <Panel onClick={(e) => e.stopPropagation()}>
      <TopBar>
        <Tabs>
          {KLIPY_TABS.map((tab) => (
            <Tab
              key={tab.type}
              type="button"
              active={type === tab.type}
              onClick={() => setType(tab.type)}
            >
              {tab.label}
            </Tab>
          ))}
        </Tabs>
        <CloseButton type="button" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </CloseButton>
      </TopBar>

      <SearchBox>
        <IconSearch size={14} color="var(--color-text-muted)" />
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${type}`}
        />
      </SearchBox>

      <Grid>
        {!KLIPY_ENABLED ? (
          <Empty>
            Set <code>VITE_KLIPY_API_KEY</code> to enable GIFs, stickers &amp;
            clips.
          </Empty>
        ) : results.length === 0 ? (
          <Empty>{isFetching ? "Loading…" : "No results"}</Empty>
        ) : (
          results.map((m) => (
            <Tile
              key={m.id}
              type="button"
              title={m.alt}
              onClick={() => onSelect(m)}
            >
              {m.isVideo ? (
                <video
                  src={m.url}
                  poster={m.previewUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img src={m.previewUrl ?? m.url} alt={m.alt ?? ""} loading="lazy" />
              )}
            </Tile>
          ))
        )}
      </Grid>

      <Credit>Powered by KLIPY</Credit>
    </Panel>
  );
}

export default MediaPicker;
