import { didAtom } from "@/src/atoms/did";
import { usePlaylistsQuery } from "@/src/hooks/usePlaylists";
import { useAtomValue } from "jotai";
import Playlists from "./Playlists";

const PlaylistsWithData = () => {
  const did = useAtomValue(didAtom);
  const { data } = usePlaylistsQuery(did!);
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
