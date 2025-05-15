import { usePlaylistsQuery } from "@/src/hooks/usePlaylists";
import Playlists from "./Playlists";

const PlaylistsWithData = () => {
  const { data } = usePlaylistsQuery("did:plc:7vdlgi2bflelz7mmuxoqjfcr");
  return (
    <Playlists
      playlists={
        data?.map((playlist: any) => ({
          title: playlist.name,
          cover: playlist.picture,
          tracks: playlist.trackCount,
        })) ?? []
      }
    />
  );
};

export default PlaylistsWithData;
