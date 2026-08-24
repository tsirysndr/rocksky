import styled from "@emotion/styled";
import { Link as DefaultLink, useParams } from "@tanstack/react-router";
import {
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import ContentLoader from "react-content-loader";
import { playlistNameFilter } from "../../../api/playlists";
import {
  createPlaylistModalOpenAtom,
  editingPlaylistAtom,
} from "../../../atoms/createPlaylist";
import { playlistsAtom } from "../../../atoms/playlists";
import { profileAtom } from "../../../atoms/profile";
import PlaylistCover from "../../../components/PlaylistCover";
import {
  usePlaylistsQuery,
  useRemovePlaylistMutation,
} from "../../../hooks/usePlaylists";

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

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 24px;
  margin-bottom: 20px;

  /* baseui's HeadingSmall carries its own line-height/margins, so the three
     children sit on different baselines without an explicit common height. */
  > * {
    display: flex;
    align-items: center;
    min-height: 32px;
  }
`;

const FilterField = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  background: var(--color-input-background);

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font-family: RockfordSansRegular;
    font-size: 14px;

    &::placeholder {
      color: var(--color-text-muted);
    }
  }
`;

const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-family: RockfordSansMedium;
  font-size: 14px;
  padding: 4px 4px;
  border: none;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const Grid = styled.div`
  margin-top: 28px;
`;

const Card = styled.div`
  position: relative;

  /* A component selector (\${Actions}) would need @emotion/babel-plugin or the
     SWC Emotion transform, neither of which this app runs — match a data
     attribute instead. */
  &:hover [data-playlist-actions],
  &:focus-within [data-playlist-actions] {
    opacity: 1;
  }
`;

// Revealed on hover over the card, and kept visible while focused so the
// actions stay reachable by keyboard (see Card).
const Actions = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.12s ease;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);

  &:hover {
    background: rgba(0, 0, 0, 0.75);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 72px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 15px;
`;

function PlaylistCardSkeleton() {
  return (
    <ContentLoader
      speed={1.6}
      width={240}
      height={300}
      viewBox="0 0 240 300"
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
    >
      <rect x="0" y="0" rx="8" ry="8" width="240" height="240" />
      <rect x="0" y="256" rx="3" ry="3" width="170" height="15" />
      <rect x="0" y="282" rx="3" ry="3" width="85" height="11" />
    </ContentLoader>
  );
}

function Playlists() {
  const { did } = useParams({ strict: false });
  const playlists = useAtomValue(playlistsAtom);
  const setPlaylists = useSetAtom(playlistsAtom);
  const openCreate = useSetAtom(createPlaylistModalOpenAtom);
  const setEditing = useSetAtom(editingPlaylistAtom);
  const removePlaylist = useRemovePlaylistMutation();
  const loggedInProfile = useAtomValue(profileAtom);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const isOwnProfile =
    !!did && (did === loggedInProfile?.did || did === loggedInProfile?.handle);

  const playlistsData = usePlaylistsQuery(did!, filter);

  const applyFilter = useMemo(
    () =>
      _.debounce((value: string) => setFilter(playlistNameFilter(value)), 250),
    [],
  );

  useEffect(() => {
    applyFilter(term);
    return () => applyFilter.cancel();
  }, [term, applyFilter]);

  useEffect(() => {
    if (playlistsData.isPending || playlistsData.isError) {
      return;
    }

    if (!playlistsData.data || !did) {
      return;
    }

    setPlaylists(playlistsData.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistsData.data, playlistsData.isPending, playlistsData.isError, did]);

  const onEdit = (playlist: {
    uri?: string;
    name: string;
    description?: string;
  }) => {
    if (!playlist.uri) return;
    setEditing({
      uri: playlist.uri,
      name: playlist.name,
      description: playlist.description,
    });
    openCreate(true);
  };

  const onDelete = async (playlist: { uri?: string; name: string }) => {
    if (!playlist.uri) return;
    if (
      !window.confirm(
        `Delete “${playlist.name}”? This removes the playlist and everything you added to it.`,
      )
    ) {
      return;
    }
    await removePlaylist.mutateAsync(playlist.uri);
  };

  const isEmpty = !playlistsData.isPending && playlists.length === 0;
  const isFiltered = !!filter;

  return (
    <>
      <Toolbar>
        <HeadingSmall
          className="!text-[var(--color-text)]"
          margin={0}
          flex="0 0 auto"
        >
          Playlists
        </HeadingSmall>
        <FilterField>
          <IconSearch size={16} color="var(--color-text-muted)" />
          <input
            value={term}
            placeholder="Filter playlists…"
            onChange={(e) => setTerm(e.target.value)}
          />
        </FilterField>
        {isOwnProfile && !isEmpty && (
          <CreateButton onClick={() => openCreate(true)}>
            <IconPlus size={16} /> Create Playlist
          </CreateButton>
        )}
      </Toolbar>

      {playlistsData.isPending && playlists.length === 0 && (
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale800"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <FlexGridItem {...itemProps} key={i}>
              <PlaylistCardSkeleton />
            </FlexGridItem>
          ))}
        </FlexGrid>
      )}

      {isEmpty && isFiltered && (
        <EmptyState>No playlists match “{term}”.</EmptyState>
      )}

      {isEmpty && !isFiltered && (
        <EmptyState>
          {isOwnProfile ? (
            <>
              <span>No playlists yet, create one</span>
              <CreateButton onClick={() => openCreate(true)}>
                <IconPlus size={16} /> Create Playlist
              </CreateButton>
            </>
          ) : (
            <span>No playlists found</span>
          )}
        </EmptyState>
      )}

      {playlists.length > 0 && (
        <Grid>
          <FlexGrid
            flexGridColumnCount={[1, 2, 3]}
            flexGridColumnGap="scale800"
            flexGridRowGap="scale800"
          >
            {playlists.map((playlist) => {
              const href = `/${playlist.uri?.split("at://")[1].replace("app.rocksky.", "")}`;
              return (
                <FlexGridItem {...itemProps} key={playlist.id}>
                  <Card>
                    <Link to={href}>
                      <PlaylistCover
                        picture={playlist.picture}
                        trackArts={playlist.trackArts}
                      />
                    </Link>
                    {isOwnProfile && playlist.uri && (
                      <Actions data-playlist-actions>
                        <IconButton
                          aria-label={`Edit ${playlist.name}`}
                          title="Edit"
                          onClick={() => onEdit(playlist)}
                        >
                          <IconPencil size={16} />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete ${playlist.name}`}
                          title="Delete"
                          disabled={removePlaylist.isPending}
                          onClick={() => void onDelete(playlist)}
                        >
                          <IconTrash size={16} />
                        </IconButton>
                      </Actions>
                    )}
                  </Card>
                  <Link to={href}>
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
              );
            })}
          </FlexGrid>
        </Grid>
      )}
    </>
  );
}

export default Playlists;
