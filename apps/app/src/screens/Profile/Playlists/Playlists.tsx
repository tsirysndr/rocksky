import Playlist from "@/src/components/Playlist";
import { FC } from "react";
import { View } from "react-native";

export type PlaylistsProps = {
  playlists: {
    cover: string;
    title: string;
    tracks: number;
  }[];
};

const Playlists: FC<PlaylistsProps> = (props) => {
  const { playlists } = props;
  return (
    <View className="flex flex-row flex-wrap gap-x-4 auto-rows-auto mt-[20px]">
      {playlists.map((playlist, index) => (
        <Playlist
          key={index}
          cover={playlist.cover}
          title={playlist.title}
          tracks={playlist.tracks}
        />
      ))}
    </View>
  );
};

export default Playlists;
