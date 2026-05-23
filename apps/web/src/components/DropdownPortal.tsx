import styled from "@emotion/styled";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FixedMenu = styled.div<{ top: number; right: number; opacity: number }>`
  position: fixed;
  top: ${(p) => p.top}px;
  right: ${(p) => p.right}px;
  opacity: ${(p) => p.opacity};
  z-index: 9999;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  min-width: 180px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

interface Pos {
  top: number;
  right: number;
  ready: boolean;
}

export function DropdownPortal({
  anchorEl,
  menuRef,
  children,
}: {
  anchorEl: HTMLElement | null;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const internalRef = useRef<HTMLDivElement | null>(null);

  // Merge external menuRef with internal measurement ref
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      internalRef.current = el;
      if (menuRef) {
        (menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    },
    [menuRef],
  );

  // Phase 1: anchor changed → render off-screen to measure
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    setPos({ top: -9999, right: Math.max(8, window.innerWidth - r.right), ready: false });
  }, [anchorEl]);

  // Phase 2: element rendered off-screen → compute final position and flip if needed
  useLayoutEffect(() => {
    if (!pos || pos.ready || !anchorEl || !internalRef.current) return;
    const r = anchorEl.getBoundingClientRect();
    const menuHeight = internalRef.current.offsetHeight;
    const right = Math.max(8, window.innerWidth - r.right);
    let top = r.bottom + 4;
    if (top + menuHeight > window.innerHeight - 8) {
      // Flip upward
      top = Math.max(8, r.top - menuHeight - 4);
    }
    setPos({ top, right, ready: true });
  }, [pos, anchorEl]);

  if (!pos) return null;

  const container = document.getElementById("root") ?? document.body;
  return createPortal(
    <FixedMenu ref={setRefs} top={pos.top} right={pos.right} opacity={pos.ready ? 1 : 0}>
      {children}
    </FixedMenu>,
    container,
  );
}
