import styled from "@emotion/styled";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { playlistsAtom } from "../../../atoms/playlists";
import SongCover from "../../../components/SongCover";
import usePlaylists from "../../../hooks/usePlaylists";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

const Link = styled(DefaultLink)`
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

function Playlists() {
  const { did } = useParams<{ did: string }>();
  const playlists = useAtomValue(playlistsAtom);
  const setPlaylists = useSetAtom(playlistsAtom);
  const { getPlaylists } = usePlaylists();

  useEffect(() => {
    if (!did) {
      return;
    }

    const fetchPlaylists = async () => {
      const data = await getPlaylists(did);
      setPlaylists(data);
    };
    fetchPlaylists();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <HeadingSmall>Playlists</HeadingSmall>
      {playlists.length === 0 && <div>No playlists found</div>}
      {playlists.length > 0 && (
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale800"
        >
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            playlists.map((playlist: any) => (
              <FlexGridItem {...itemProps} key={playlist.id}>
                <Link to={`/${playlist.uri?.split("at://")[1]}`}>
                  <SongCover cover={playlist?.picture} />
                </Link>
                <Link to={`/${playlist.uri?.split("at://")[1]}`}>
                  <LabelMedium>{playlist.name}</LabelMedium>
                </Link>
                <LabelSmall color="rgba(36, 49, 61, 0.65)" marginTop={"3px"}>
                  {playlist.trackCount} Track
                  {playlist.trackCount > 1 ? "s" : ""}
                </LabelSmall>
              </FlexGridItem>
            ))
          }
        </FlexGrid>
      )}
    </>
  );
}

export default Playlists;
