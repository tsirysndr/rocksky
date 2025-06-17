import styled from "@emotion/styled";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import { Link as DefaultLink } from "react-router";
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

interface AlbumsProps {
  topAlbums: {
    id: string;
    title: string;
    artist: string;
    album_art: string;
    artist_uri: string;
    uri: string;
  }[];
}

function Albums(props: AlbumsProps) {
  return (
    <>
      <HeadingSmall marginBottom={"15px"}>Albums</HeadingSmall>
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
                <Link to={`/${album.uri.split("at://")[1]}`}>
                  <SongCover cover={album.album_art} size={180} />
                </Link>
              )}
              {!album.uri && <SongCover cover={album.album_art} size={180} />}
              {album.uri && (
                <Link to={`/${album.uri.split("at://")[1]}`}>
                  <LabelMedium>{album.title}</LabelMedium>
                </Link>
              )}
              {!album.uri && <LabelMedium>{album.title}</LabelMedium>}
              {album.artist_uri && (
                <Link to={`/${album.artist_uri.split("at://")[1]}`}>
                  <LabelSmall color="rgba(36, 49, 61, 0.65)">
                    {album.artist}
                  </LabelSmall>
                </Link>
              )}
              {!album.artist_uri && (
                <LabelSmall color="rgba(36, 49, 61, 0.65)">
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

export default Albums;
