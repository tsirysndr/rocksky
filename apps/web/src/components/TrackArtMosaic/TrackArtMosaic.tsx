import styled from "@emotion/styled";
import { IconPlaylist } from "@tabler/icons-react";

// A playlist cover built from its tracks' album art. Unlike PlaylistCover this
// fills whatever box it is dropped into, so the same mosaic works as a 44px row
// thumbnail and as a 160px page header.

const Grid = styled.div<{ columns: string }>`
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: ${({ columns }) => columns};
  grid-template-rows: ${({ columns }) => columns};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Fallback = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
`;

type Props = {
  /** Album art of the playlist's tracks; the first four distinct ones are used. */
  trackArts?: string[] | null;
  /** Size of the placeholder icon shown when no track has art. */
  fallbackSize?: number;
};

function TrackArtMosaic({ trackArts, fallbackSize = 18 }: Props) {
  const arts = (trackArts ?? []).filter(Boolean);

  if (arts.length === 0) {
    return (
      <Fallback>
        <IconPlaylist size={fallbackSize} />
      </Fallback>
    );
  }

  // Only a full 2×2 reads as a mosaic — two or three covers stretched across
  // the box just look broken, so anything short of four shows one cover.
  const shown = arts.length >= 4 ? arts.slice(0, 4) : arts.slice(0, 1);

  return (
    <Grid columns={shown.length === 4 ? "1fr 1fr" : "1fr"}>
      {shown.map((art, i) => (
        <img key={`${art}-${i}`} src={art} alt="" />
      ))}
    </Grid>
  );
}

export default TrackArtMosaic;
