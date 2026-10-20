import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { IconArrowUp } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { nowPlayingAtom } from "../../atoms/nowpaying";

const ScrollToTopButton = styled.button<{ raised: boolean }>`
  position: fixed;
  right: 22px;
  bottom: calc(${({ raised }) => raised ? 152 : 24}px + env(safe-area-inset-bottom, 0px));
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  &:hover { filter: brightness(1.1); }
  &:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 4px;
  }
`;

export default function ScrollToTop() {
  const anchor = useRef<HTMLSpanElement>(null);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = anchor.current?.closest("#app-container");
    if (!container) return;
    const onScroll = () => setVisible(container.scrollTop > 300);
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    anchor.current?.closest("#app-container")?.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  return (
    <span ref={anchor}>
      {visible && (
        <ScrollToTopButton
          data-scroll-to-top
          raised={!!nowPlaying}
          type="button"
          aria-label="Scroll to top"
          title="Scroll to top"
          onClick={scrollToTop}
        >
          <IconArrowUp size={22} aria-hidden="true" />
        </ScrollToTopButton>
      )}
    </span>
  );
}
