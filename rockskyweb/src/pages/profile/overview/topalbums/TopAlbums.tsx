import styled from "@emotion/styled";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { topAlbumsAtom } from "../../../../atoms/topAlbums";
import { userAtom } from "../../../../atoms/user";
import SongCover from "../../../../components/SongCover";
import useLibrary from "../../../../hooks/useLibrary";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

function TopAlbums() {
  const setTopAlbums = useSetAtom(topAlbumsAtom);
  const topAlbums = useAtomValue(topAlbumsAtom);
  const { did } = useParams<{ did: string }>();
  const { getAlbums } = useLibrary();
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopAlbums = async () => {
      const data = await getAlbums(did);
      setTopAlbums(data);
    };

    getTopAlbums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <HeadingSmall marginBottom={"15px"}>Top Albums</HeadingSmall>
        <a
          href={`/profile/${user?.handle}?tab=2`}
          style={{
            marginTop: 40,
            textDecoration: "none",
            color: "#ff2876",
          }}
        >
          See All
        </a>
      </div>
      {!topAlbums.length && (
        <div>@{user?.handle} has not listened to any albums yet.</div>
      )}
      {topAlbums.length > 0 && (
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale800"
        >
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            topAlbums.map((album: any) => (
              <FlexGridItem {...itemProps} key={album.id}>
                <Link to={`/${album.uri.split("at://")[1]}`}>
                  <SongCover cover={album.album_art} size={230} />
                </Link>
                <Link to={`/${album.uri.split("at://")[1]}`}>
                  <LabelMedium>{album.title}</LabelMedium>
                </Link>
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
                <LabelSmall color="#000">{album.scrobbles} plays</LabelSmall>
              </FlexGridItem>
            ))
          }
        </FlexGrid>
      )}
    </>
  );
}

export default TopAlbums;
