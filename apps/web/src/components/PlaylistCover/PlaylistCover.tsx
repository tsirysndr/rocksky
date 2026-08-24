import styled from "@emotion/styled";
import { IconMusic } from "@tabler/icons-react";

const SIZE = 240;

const Frame = styled.div`
  width: ${SIZE}px;
  height: ${SIZE}px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: -5px;
  background: var(--color-menu-hover);
  display: grid;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Fallback = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
`;

type Props = {
  /** The playlist's own picture; when set it wins over the mosaic. */
  picture?: string | null;
  /** Album art of up to four tracks, for the mosaic fallback. */
  trackArts?: string[] | null;
};

/**
 * Playlist cover: the playlist's picture when it has one, otherwise a 2×2
 * mosaic of four of its tracks' album covers — or a single track cover when
 * the playlist doesn't have four distinct ones.
 */
function PlaylistCover({ picture, trackArts }: Props) {
  const arts = (trackArts ?? []).filter(Boolean);

  if (picture) {
    return (
      <Frame>
        <img src={picture} alt="" />
      </Frame>
    );
  }

  if (arts.length === 0) {
    return (
      <Frame>
        <Fallback>
          <IconMusic size={Math.round(SIZE * 0.32)} />
        </Fallback>
      </Frame>
    );
  }

  const shown = arts.length >= 4 ? arts.slice(0, 4) : arts.slice(0, 1);
  const grid = shown.length === 4 ? "1fr 1fr" : "1fr";

  return (
    <Frame style={{ gridTemplateColumns: grid, gridTemplateRows: grid }}>
      {shown.map((art, i) => (
        <img key={`${art}-${i}`} src={art} alt="" />
      ))}
    </Frame>
  );
}

export default PlaylistCover;
