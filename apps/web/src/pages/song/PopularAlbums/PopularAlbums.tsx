import styled from "@emotion/styled";
import { uriToPath } from "../../../lib/uri";
import { Link as DefaultLink } from "@tanstack/react-router";
import { BlockProps } from "baseui/block";
import { FlexGridItem } from "baseui/flex-grid";
import ResponsiveFlexGrid from "../../../components/ResponsiveFlexGrid";
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
      <ResponsiveFlexGrid
        flexGridColumnGap="scale800"
        flexGridRowGap="scale800"
      >
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          props.topAlbums.map((album: any) => (
            <FlexGridItem {...itemProps} key={album.id}>
              {album.uri && (
                <Link to={uriToPath(album.uri)}>
                  <SongCover cover={album.albumArt} size={230} />
                </Link>
              )}
              {!album.uri && <SongCover cover={album.albumArt} size={230} />}
              {album.uri && (
                <Link to={uriToPath(album.uri)}>
                  <LabelMedium className="!text-[var(--color-text)]">
                    {album.title}
                  </LabelMedium>
                </Link>
              )}
              {!album.uri && <LabelMedium>{album.title}</LabelMedium>}
              {album.artistUri && (
                <Link to={uriToPath(album.artistUri)}>
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
      </ResponsiveFlexGrid>
    </>
  );
}

export default PopularAlbums;
