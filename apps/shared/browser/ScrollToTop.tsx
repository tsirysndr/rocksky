import styled from "@emotion/styled";
import { IconArrowUp } from "@tabler/icons-react";
import { useEffect, useState } from "react";

const Button = styled.button`
  position: fixed;
  right: calc(24px + env(safe-area-inset-right, 0px));
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent);
  border-radius: 50%;
  background: var(--color-text);
  color: var(--color-background);
  box-shadow: 0 4px 18px #0003;
  cursor: pointer;
  transition: transform 150ms ease;

  body:has([data-floating-player="true"]) & {
    bottom: calc(148px + env(safe-area-inset-bottom, 0px));
  }

  &:hover {
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** Main's scroll container is independent of window scrolling in both apps. */
export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const page = document.getElementById("app-container");
    if (!page) return;
    const update = () => setVisible(page.scrollTop > 300);
    update();
    page.addEventListener("scroll", update, { passive: true });
    return () => page.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;
  return (
    <Button
      type="button"
      aria-label="Scroll to top"
      title="Scroll to top"
      onClick={() => {
        document.getElementById("app-container")?.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }}
    >
      <IconArrowUp size={22} aria-hidden="true" />
    </Button>
  );
}
