import styled from "@emotion/styled";
import { IconLoader2, IconPhotoDown } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { downloadNodeAsPng, resolveImages } from "../../lib/shareImage";
import TopShareCard, {
  type TopShareItem,
  type TopShareKind,
} from "./TopShareCard";

export type { TopShareItem, TopShareKind };

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  opacity: 0.7;

  &:hover:not(:disabled) {
    opacity: 1;
    background: var(--color-menu-hover);
  }

  &:disabled {
    cursor: progress;
  }

  @keyframes export-top-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .spin {
    animation: export-top-spin 0.8s linear infinite;
  }
`;

/** Off-screen and outside the page tree, so a transformed ancestor can't
 * re-anchor it and the capture isn't clipped by an overflow container. */
const Offscreen = styled.div`
  position: fixed;
  left: -10000px;
  top: 0;
  pointer-events: none;
  z-index: -1;
`;

const KIND_TITLES: Record<TopShareKind, string> = {
  artists: "Top Artists",
  albums: "Top Albums",
  tracks: "Top Tracks",
};

interface ExportTopButtonProps {
  kind: TopShareKind;
  items: TopShareItem[];
  rangeLabel: string;
  user?: { handle: string; displayName?: string; avatar?: string } | null;
  darkMode: boolean;
}

function ExportTopButton({
  kind,
  items,
  rangeLabel,
  user,
  darkMode,
}: ExportTopButtonProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const limit = kind === "albums" ? 9 : 10;
  const shown = items.slice(0, limit);

  const onExport = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const resolved = await resolveImages([
        user.avatar,
        ...shown.map((i) => i.image),
      ]);
      flushSync(() => setImages(resolved));
      if (cardRef.current) {
        const slug = rangeLabel.toLowerCase().replace(/\s+/g, "-");
        await downloadNodeAsPng(
          cardRef.current,
          `rocksky-top-${kind}-${user.handle}-${slug}.png`,
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setImages(null);
      setBusy(false);
    }
  };

  if (!user || shown.length === 0) return null;

  const label = `Export ${KIND_TITLES[kind].toLowerCase()} as image`;

  return (
    <>
      <Button
        type="button"
        onClick={onExport}
        disabled={busy}
        aria-label={label}
        title={label}
      >
        {busy ? (
          <IconLoader2 size={18} className="spin" />
        ) : (
          <IconPhotoDown size={18} />
        )}
      </Button>
      {images &&
        createPortal(
          <Offscreen aria-hidden="true">
            <TopShareCard
              cardRef={cardRef}
              kind={kind}
              title={KIND_TITLES[kind]}
              rangeLabel={rangeLabel}
              items={shown}
              images={images}
              user={user}
              darkMode={darkMode}
            />
          </Offscreen>,
          document.body,
        )}
    </>
  );
}

export default ExportTopButton;
