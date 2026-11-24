import styled from "@emotion/styled";
import { IconMusic } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const Frame = styled.div`
  position: relative;
  isolation: isolate;
  padding-top: 50px;
  padding-bottom: 100px;

  .detail-sticky-header {
    position: sticky;
    top: 80px;
    z-index: 2;
    height: 64px;
    margin-bottom: -64px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--color-background);
    border-bottom: 1px solid color-mix(in srgb, var(--color-text) 12%, transparent);
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }

  &[data-pinned="true"] .detail-sticky-header {
    visibility: visible;
    opacity: 1;
  }

  .detail-sticky-art {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    color: var(--color-text-muted);
    background: var(--color-menu-hover);
  }

  .detail-sticky-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .detail-sticky-meta {
    min-width: 0;
  }

  .detail-sticky-meta strong,
  .detail-sticky-meta span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-sticky-meta strong {
    font-family: RockfordSansBold;
    font-size: 14px;
    color: var(--color-text);
  }

  .detail-sticky-meta span {
    margin-top: 2px;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .detail-header-backdrop {
    position: absolute;
    /* Main starts 50px down; the fixed top bar ends at 80px. */
    top: 30px;
    inset-inline: 0;
    height: 430px;
    overflow: hidden;
    z-index: -1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 300ms ease;
    mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      #000 12%,
      #000 35%,
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      #000 12%,
      #000 35%,
      transparent 100%
    );
  }

  &[data-artwork="true"] .detail-header-backdrop {
    opacity: 0.42;
  }

  .detail-header-backdrop img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 35%;
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      #000 12%,
      #000 88%,
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      #000 12%,
      #000 88%,
      transparent 100%
    );
  }

  &[data-artwork="true"] .detail-header-copy {
    --color-text-muted: var(--detail-header-text-muted);
    text-shadow: var(--detail-header-text-shadow);
  }

  @media (max-width: 600px) {
    .detail-header-backdrop {
      height: 380px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .detail-header-backdrop,
    .detail-sticky-header {
      transition: none;
    }
  }
`;

/** Decorative artwork stays behind the header and fades into either theme. */
export default function DetailPage({
  artwork,
  children,
  className,
  title,
  subtitle,
  headerReady = true,
}: {
  artwork: readonly (string | null | undefined)[];
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  headerReady?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [failedSources, setFailedSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadedSource, setLoadedSource] = useState<string>();
  const src = artwork
    .map((source) => source?.trim())
    .find(
      (source) =>
        source &&
        !source.includes("2a96cbd8b46e442fc41c2b86b821562f") &&
        !failedSources.has(source),
    );

  useEffect(() => {
    const header = frame.current?.querySelector("[data-detail-header]");
    const root = document.getElementById("app-container");
    if (!headerReady || !header || !root || !title) {
      setPinned(false);
      return;
    }
    const top = root.getBoundingClientRect().top + 80;
    setPinned(header.getBoundingClientRect().bottom <= top);
    const observer = new IntersectionObserver(
      ([entry]) => {
        setPinned(
          !entry.isIntersecting &&
            entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? top),
        );
      },
      { root, rootMargin: "-80px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, [title, headerReady]);

  return (
    <Frame
      ref={frame}
      className={className}
      data-artwork={!!src && loadedSource === src}
      data-pinned={pinned}
    >
      {src && (
        <div className="detail-header-backdrop" aria-hidden="true">
          <img
            key={src}
            src={src}
            alt=""
            decoding="async"
            draggable={false}
            onLoad={() => setLoadedSource(src)}
            onError={() =>
              setFailedSources((failed) => new Set([...failed, src]))
            }
          />
        </div>
      )}
      {title && (
        <div className="detail-sticky-header" aria-hidden={!pinned}>
          <div className="detail-sticky-art" aria-hidden="true">
            {src ? (
              <img
                src={src}
                alt=""
                onError={() =>
                  setFailedSources((failed) => new Set([...failed, src]))
                }
              />
            ) : (
              <IconMusic size={20} />
            )}
          </div>
          <div className="detail-sticky-meta">
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
        </div>
      )}
      {children}
    </Frame>
  );
}
