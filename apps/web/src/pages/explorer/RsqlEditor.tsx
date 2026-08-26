import styled from "@emotion/styled";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Entity } from "./fields";
import { fieldNames, opsFor, valuesFor } from "./fields";
import { completionAt, tokenize } from "./rsql";

const Frame = styled.div`
  position: relative;
`;

const Editor = styled.div`
  position: relative;
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  background: var(--color-input-background);
  overflow: hidden;

  &:focus-within {
    border-color: var(--color-purple);
  }
`;

/* The overlay and the textarea must lay out identically or the coloured text
   drifts away from the caret. */
const shared = `
  margin: 0;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  letter-spacing: normal;
  tab-size: 2;
`;

const Highlight = styled.pre`
  ${shared}
  min-height: 76px;
  pointer-events: none;
  color: var(--color-text);
`;

/* Zero-width marker rendered at the caret inside the overlay. The overlay
   already mirrors the textarea's metrics exactly, so its position is the
   caret's position — no second measuring element needed. */
const CaretMark = styled.span`
  display: inline-block;
  width: 0;
`;

const Input = styled.textarea`
  ${shared}
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--color-text);

  &::selection {
    background: color-mix(in srgb, var(--color-purple) 32%, transparent);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const Tok = styled.span<{ kind: string }>`
  color: ${({ kind }) => {
    switch (kind) {
      case "field":
        return "var(--rsql-field)";
      case "unknown-field":
        return "var(--rsql-bad)";
      case "op":
        return "var(--rsql-op)";
      case "value":
        return "var(--rsql-value)";
      case "string":
        return "var(--rsql-string)";
      case "logic":
        return "var(--rsql-logic)";
      case "paren":
        return "var(--rsql-paren)";
      case "error":
        return "var(--rsql-bad)";
      default:
        return "inherit";
    }
  }};
  text-decoration: ${({ kind }) =>
    kind === "error" || kind === "unknown-field"
      ? "underline wavy var(--rsql-bad)"
      : "none"};
  text-underline-offset: 3px;
`;

const Menu = styled.ul<{ left: number; top: number }>`
  position: absolute;
  z-index: 30;
  left: ${({ left }) => left}px;
  top: ${({ top }) => top}px;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.24);
  background: var(--color-background);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);

  min-width: 280px;
  max-width: min(420px, 90vw);
`;

const Item = styled.li<{ active: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  background: ${({ active }) => (active ? "var(--color-menu-hover)" : "none")};
`;

const ItemName = styled.span`
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text);
  white-space: nowrap;
`;

const ItemType = styled.span`
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  color: var(--color-text-muted);
  white-space: nowrap;
`;

const ItemHint = styled.span`
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type Suggestion = { insert: string; label: string; type?: string; hint: string };

function RsqlEditor({
  entity,
  value,
  onChange,
  onRun,
}: {
  entity: Entity;
  value: string;
  onChange: (next: string) => void;
  onRun: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const known = useMemo(() => fieldNames(entity), [entity]);
  const tokens = useMemo(() => tokenize(value, known), [value, known]);

  const completion = useMemo(
    () => completionAt(value, caret),
    [value, caret],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const prefix = completion.prefix.toLowerCase();
    if (completion.what === "field") {
      return entity.fields
        .filter((f) => f.name.toLowerCase().includes(prefix))
        .map((f) => ({
          insert: f.name,
          label: f.name,
          type: f.type,
          hint: f.hint,
        }));
    }
    const field = entity.fields.find((f) => f.name === completion.field);
    if (completion.what === "op") {
      return opsFor(field?.type ?? "string")
        .filter((o) => o.op.startsWith(completion.prefix))
        .map((o) => ({ insert: o.op, label: o.op, hint: o.hint }));
    }
    return valuesFor(field)
      .filter((v) => v.toLowerCase().startsWith(prefix))
      .map((v) => ({ insert: v, label: v, hint: "suggested value" }));
  }, [completion, entity]);

  useEffect(() => {
    setActive(0);
  }, [completion.prefix, completion.what]);

  // Anchor the menu under the caret. Measured after paint, since the marker
  // only has a position once the split above has rendered.
  useEffect(() => {
    if (!open) return;
    const mark = caretRef.current;
    // The frame, not the editor box: the menu is positioned against it.
    const frame = frameRef.current;
    if (!mark || !frame) return;
    const markBox = mark.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    setAnchor({
      left: Math.max(0, Math.min(markBox.left - frameBox.left, frameBox.width - 280)),
      top: markBox.bottom - frameBox.top + 8,
    });
  }, [open, caret, value]);

  const accept = useCallback(
    (suggestion: Suggestion) => {
      const next =
        value.slice(0, completion.from) +
        suggestion.insert +
        value.slice(completion.to);
      const at = completion.from + suggestion.insert.length;
      onChange(next);
      setOpen(false);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(at, at);
        setCaret(at);
      });
    },
    [completion, onChange, value],
  );

  const syncCaret = () => {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        accept(suggestions[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setOpen(false);
      onRun();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      setOpen(false);
      onRun();
      return;
    }
    if (e.key === " " && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <Frame ref={frameRef}>
      <Editor>
        <Highlight ref={highlightRef} aria-hidden="true">
          {tokens.map((t) =>
            // Split the token the caret sits inside so the marker lands exactly
            // where the caret is, not at the token boundary.
            caret > t.start && caret < t.end ? (
              <Tok key={`${t.start}-${t.kind}`} kind={t.kind}>
                {t.text.slice(0, caret - t.start)}
                <CaretMark ref={caretRef} />
                {t.text.slice(caret - t.start)}
              </Tok>
            ) : (
              <Tok key={`${t.start}-${t.kind}`} kind={t.kind}>
                {caret === t.start && <CaretMark ref={caretRef} />}
                {t.text}
                {caret === t.end && <CaretMark ref={caretRef} />}
              </Tok>
            ),
          )}
          {tokens.length === 0 && <CaretMark ref={caretRef} />}
          {"\n"}
        </Highlight>
        <Input
          ref={inputRef}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={`e.g. ${entity.examples[0].filter}`}
          value={value}
          aria-label="RSQL filter"
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
            setOpen(true);
          }}
          onScroll={(e) => {
            const el = highlightRef.current;
            if (el) el.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </Editor>
      {open && suggestions.length > 0 && (
        <Menu left={anchor.left} top={anchor.top}>
          {suggestions.map((s, i) => (
            <Item
              key={s.label}
              active={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
            >
              <ItemName>{s.label}</ItemName>
              {s.type && <ItemType>{s.type}</ItemType>}
              <ItemHint>{s.hint}</ItemHint>
            </Item>
          ))}
        </Menu>
      )}
    </Frame>
  );
}

export default RsqlEditor;
