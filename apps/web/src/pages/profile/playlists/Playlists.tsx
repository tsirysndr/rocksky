import styled from "@emotion/styled";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { playlistsAtom } from "../../../atoms/playlists";
import SongCover from "../../../components/SongCover";
import { usePlaylistsQuery } from "../../../hooks/usePlaylists";

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
  const playlistsData = usePlaylistsQuery(did!);

  useEffect(() => {
    if (playlistsData.isLoading || playlistsData.isError) {
      return;
    }

    if (!playlistsData.data || !did) {
      return;
    }

    setPlaylists(playlistsData.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistsData.data, playlistsData.isLoading, playlistsData.isError, did]);

  return (
    <>
      <HeadingSmall className="!text-[var(--color-text)]">
        Playlists
      </HeadingSmall>
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
                  <LabelMedium className="!text-[var(--color-text)]">
                    {playlist.name}
                  </LabelMedium>
                </Link>
                <LabelSmall
                  className="!text-[var(--color-text-muted)]"
                  marginTop={"3px"}
                >
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
