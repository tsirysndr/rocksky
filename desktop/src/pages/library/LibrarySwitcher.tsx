import styled from "@emotion/styled";
import {
  IconCheck,
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type LibrarySource, remoteLibraries } from "../../api/remoteLibraries";
import { DropdownPortal } from "../../components/DropdownPortal";
import LibraryLogo from "../../components/LibraryLogo";
import LibrarySources from "./LibrarySources";

const Wrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Select = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  padding: 4px 10px 4px 4px;
  border-radius: 12px;
  border: none;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--color-primary) 15%, transparent); }
`;

const Label = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: var(--color-menu-hover);
  color: var(--color-text);
  cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--color-primary) 15%, transparent); }
`;

const Item = styled.div<{ active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 4px;
  border-radius: 8px;
  color: var(--color-text);
  cursor: pointer;
  background: ${(p) =>
    p.active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "transparent"};
  &:hover { background: var(--color-menu-hover); }
`;

const Texts = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Title = styled.p`
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
`;

const Hint = styled.p`
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const Section = styled.div`
  padding: 8px 8px 4px;
  font-size: 11px;
  letter-spacing: 1.2px;
  font-family: RockfordSansMedium;
  color: var(--color-text-muted);
`;

const Mini = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  &:hover { color: var(--color-text); background: color-mix(in srgb, var(--color-text-muted) 15%, transparent); }
`;

export default function LibrarySwitcher({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const cache = useQueryClient();
  const sources = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
  });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [modal, setModal] = useState<{ existing?: LibrarySource } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setAnchor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAnchor(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  const remote = sources.data?.sources.find((s) => s.id === selected);
  const name = remote?.name ?? (selected === "local" ? "Local music" : "Uploaded music");

  const disconnect = async (source: LibrarySource) => {
    if (!window.confirm(`Disconnect ${source.name}? Your server’s music stays unchanged.`)) return;
    try {
      await remoteLibraries.remove(source.id);
      cache.removeQueries({ queryKey: ["remote-library", source.id] });
      await cache.invalidateQueries({ queryKey: ["remote-libraries"] });
      if (selected === source.id) onSelect("uploaded");
    } catch {
      // list refetch reflects whatever state the store is in
    }
  };

  return (
    <Wrap>
      <Select
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <LibraryLogo kind={remote?.kind ?? (selected === "local" ? "local" : "uploaded")} size={28} />
        <Label>{name}</Label>
        <IconChevronDown size={16} />
      </Select>
      <IconBtn type="button" aria-label="Connect a library" onClick={() => setModal({})}>
        <IconPlus size={18} />
      </IconBtn>
      {anchor && (
        <DropdownPortal anchorEl={anchor} menuRef={menuRef}>
          {(
            [
              { id: "local", name: "Local music", hint: "Music on this computer" },
              { id: "uploaded", name: "Uploaded music", hint: "Your Rocksky library" },
            ] as const
          ).map((item) => (
            <Item
              key={item.id}
              role="option"
              aria-selected={selected === item.id}
              active={selected === item.id}
              onClick={() => {
                onSelect(item.id);
                setAnchor(null);
              }}
            >
              <LibraryLogo kind={item.id} size={36} />
              <Texts>
                <Title>{item.name}</Title>
                <Hint>{item.hint}</Hint>
              </Texts>
              {selected === item.id && <IconCheck size={16} color="var(--color-primary)" />}
            </Item>
          ))}
          <Section>CONNECTED SERVERS</Section>
          {(sources.data?.sources ?? []).map((source) => (
            <Item
              key={source.id}
              role="option"
              aria-selected={selected === source.id}
              active={selected === source.id}
              onClick={() => {
                onSelect(source.id);
                setAnchor(null);
              }}
            >
              <LibraryLogo kind={source.kind} size={36} />
              <Texts>
                <Title>{source.name}</Title>
                <Hint>{source.baseUrl}</Hint>
              </Texts>
              {selected === source.id && <IconCheck size={16} color="var(--color-primary)" />}
              {source.kind !== "plyr" && (
                <Mini
                  type="button"
                  aria-label={`Edit ${source.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnchor(null);
                    setModal({ existing: source });
                  }}
                >
                  <IconPencil size={14} />
                </Mini>
              )}
              <Mini
                type="button"
                aria-label={`Disconnect ${source.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setAnchor(null);
                  void disconnect(source);
                }}
              >
                <IconTrash size={14} />
              </Mini>
            </Item>
          ))}
          {sources.data?.sources.length === 0 && (
            <Hint style={{ padding: "4px 8px 8px" }}>
              Your connected music servers will appear here.
            </Hint>
          )}
          {sources.isError && (
            <Hint style={{ padding: "4px 8px 8px" }}>Could not load connections.</Hint>
          )}
        </DropdownPortal>
      )}
      {modal && (
        <LibrarySources
          existing={modal.existing}
          onClose={() => setModal(null)}
          onSelect={(id) => {
            setModal(null);
            onSelect(id);
          }}
        />
      )}
    </Wrap>
  );
}
