import styled from "@emotion/styled";
import { useState, type ReactNode } from "react";

const Frame = styled.div`
  position: relative;
  isolation: isolate;
  padding-top: 50px;
  padding-bottom: 100px;

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
    .detail-header-backdrop {
      transition: none;
    }
  }
`;

/** Decorative artwork stays behind the header and fades into either theme. */
export default function DetailPage({
  artwork,
  children,
  className,
}: {
  artwork: readonly (string | null | undefined)[];
  children: ReactNode;
  className?: string;
}) {
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

  return (
    <Frame className={className} data-artwork={!!src && loadedSource === src}>
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
      {children}
    </Frame>
  );
}
