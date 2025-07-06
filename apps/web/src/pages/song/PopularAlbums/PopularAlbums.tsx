import styled from "@emotion/styled";
import { Link as DefaultLink } from "@tanstack/react-router";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingXSmall, LabelMedium, LabelSmall } from "baseui/typography";
import SongCover from "../../../components/SongCover";

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

interface PopularAlbumsProps {
  topAlbums: {
    id: string;
    title: string;
    artist: string;
    albumArt: string;
    artistUri: string;
    uri: string;
  }[];
  artist: string;
}

function PopularAlbums(props: PopularAlbumsProps) {
  return (
    <>
      <HeadingXSmall
        marginBottom={"20px"}
        className="!text-[var(--color-text)]"
      >
        Popular Albums by {props.artist}
      </HeadingXSmall>
      <FlexGrid
        flexGridColumnCount={[1, 2, 3]}
        flexGridColumnGap="scale800"
        flexGridRowGap="scale800"
      >
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          props.topAlbums.map((album: any) => (
            <FlexGridItem {...itemProps} key={album.id}>
              {album.uri && (
                <Link
                  to={`/${album.uri.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  <SongCover cover={album.albumArt} size={230} />
                </Link>
              )}
              {!album.uri && <SongCover cover={album.albumArt} size={230} />}
              {album.uri && (
                <Link
                  to={`/${album.uri.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  <LabelMedium className="!text-[var(--color-text)]">
                    {album.title}
                  </LabelMedium>
                </Link>
              )}
              {!album.uri && <LabelMedium>{album.title}</LabelMedium>}
              {album.artistUri && (
                <Link
                  to={`/${album.artistUri.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  <LabelSmall className="!text-[var(--color-text-muted)]">
                    {album.artist}
                  </LabelSmall>
                </Link>
              )}
              {!album.artistUri && (
                <LabelSmall className="!text-[var(--color-text-muted)]">
                  {album.artist}
                </LabelSmall>
              )}
            </FlexGridItem>
          ))
        }
      </FlexGrid>
    </>
  );
}

export default PopularAlbums;
