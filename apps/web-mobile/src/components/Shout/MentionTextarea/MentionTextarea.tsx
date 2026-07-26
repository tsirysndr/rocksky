import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { Textarea, type TextareaProps } from "baseui/textarea";
import { useEffect, useRef, useState } from "react";
import { getCaretCoordinates } from "../../../lib/caret";
import {
  activeMentionToken,
  searchActorsTypeahead,
} from "../../../lib/richtext";

/**
 * A baseui Textarea with an `@mention` typeahead popup. Fully controlled via
 * `value`/`onChange`; the popup queries the Bluesky AppView and inserts the
 * chosen handle. Purely a UI affordance — facets are resolved separately on
 * submit via `resolveMentionFacets`.
 */

const Wrapper = styled.div`
  position: relative;
`;

const Popup = styled.ul`
  position: absolute;
  z-index: 30;
  margin: 0;
  padding: 4px;
  list-style: none;
  max-height: 224px;
  width: 256px;
  max-width: calc(100% - 8px);
  overflow-y: auto;
  border-radius: 12px;
  border: 1px solid var(--color-input-background);
  background-color: var(--color-background);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
`;

const Item = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  background-color: ${({ active }) =>
    active ? "var(--color-input-background)" : "transparent"};

  &:hover {
    background-color: var(--color-input-background);
  }
`;

const Avatar = styled.span`
  display: flex;
  height: 28px;
  width: 28px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 999px;
  background-color: var(--color-input-background);

  & > img {
    height: 100%;
    width: 100%;
    object-fit: cover;
  }
`;

const Names = styled.span`
  min-width: 0;
`;

const DisplayName = styled.span`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: 14px;
`;

const Handle = styled.span`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
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

interface MentionTextareaProps extends Omit<TextareaProps, "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

function MentionTextarea({
  value,
  onChange,
  overrides,
  ...rest
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [caret, setCaret] = useState<{ top: number; left: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const debouncedQuery = useDebounced(mention?.query ?? "", 200);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["mention-typeahead", debouncedQuery],
    queryFn: () => searchActorsTypeahead(debouncedQuery),
    enabled: mention !== null && debouncedQuery.length >= 1,
    staleTime: 30_000,
  });
  const popupOpen = mention !== null && suggestions.length > 0;

  const syncMention = (text: string, caretPos: number) => {
    const token = activeMentionToken(text, caretPos);
    setMention(token);
    setActiveIdx(0);
    const el = textareaRef.current;
    if (token && el) {
      const c = getCaretCoordinates(el, token.start);
      const maxLeft = Math.max(0, el.clientWidth - 256);
      setCaret({
        top: el.offsetTop + c.top + c.height,
        left: el.offsetLeft + Math.min(c.left, maxLeft),
      });
    } else {
      setCaret(null);
    }
  };

  const insertMention = (handle: string) => {
    if (!mention) return;
    const el = textareaRef.current;
    const caretPos = el?.selectionStart ?? value.length;
    const next =
      value.slice(0, mention.start) + `@${handle} ` + value.slice(caretPos);
    onChange(next);
    setMention(null);
    setCaret(null);
    requestAnimationFrame(() => {
      const pos = mention.start + handle.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!popupOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(suggestions[activeIdx]!.handle);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
      setCaret(null);
    }
  };

  return (
    <Wrapper>
      <Textarea
        inputRef={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value);
          syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
        }}
        overrides={{
          ...overrides,
          Input: {
            ...overrides?.Input,
            props: {
              ...(overrides?.Input && "props" in overrides.Input
                ? overrides.Input.props
                : {}),
              onClick: (e: React.MouseEvent<HTMLTextAreaElement>) =>
                syncMention(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? 0,
                ),
            },
          },
        }}
        onKeyUp={(e) =>
          syncMention(
            e.currentTarget.value,
            e.currentTarget.selectionStart ?? 0,
          )
        }
        onKeyDown={onKeyDown}
        {...rest}
      />

      {popupOpen && caret && (
        <Popup style={{ top: caret.top, left: caret.left }}>
          {suggestions.map((s, i) => (
            <li key={s.did}>
              <Item
                type="button"
                active={i === activeIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(s.handle);
                }}
              >
                <Avatar>{s.avatar && <img src={s.avatar} alt="" />}</Avatar>
                <Names>
                  <DisplayName>{s.displayName || s.handle}</DisplayName>
                  <Handle>@{s.handle}</Handle>
                </Names>
              </Item>
            </li>
          ))}
        </Popup>
      )}
    </Wrapper>
  );
}

export default MentionTextarea;
