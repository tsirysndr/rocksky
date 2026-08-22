import styled from "@emotion/styled";
import { useEffect } from "react";
import useNowPlayingBackground from "../../hooks/useNowPlayingBackground";

const Layer = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
`;

const Art = styled.div`
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(64px) saturate(140%);
  transform: scale(1.2);
`;

const Tint = styled.div`
  position: absolute;
  inset: 0;
  background-color: var(--color-background);
  opacity: 0.86;
`;

function NowPlayingBackground() {
  const albumArt = useNowPlayingBackground();

  // The page shell paints an opaque --color-background over the whole
  // viewport; .art-bg (see index.css) turns those surfaces translucent so
  // this fixed layer can show through.
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    root.classList.toggle("art-bg", !!albumArt);
    return () => root.classList.remove("art-bg");
  }, [albumArt]);

  if (!albumArt) return null;

  return (
    <Layer aria-hidden>
      <Art style={{ backgroundImage: `url(${albumArt})` }} />
      <Tint />
    </Layer>
  );
}

export default NowPlayingBackground;
