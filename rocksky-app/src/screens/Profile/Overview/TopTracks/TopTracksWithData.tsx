import { didAtom } from "@/src/atoms/did";
import { handleAtom } from "@/src/atoms/handle";
import { useTracksQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useAtomValue } from "jotai";
import { FC } from "react";
import TopTracks from "./TopTracks";

export type TopTracksWithDataProps = {
  className?: string;
};

const TopTracksWithData: FC<TopTracksWithDataProps> = (props) => {
  const handle = useAtomValue(handleAtom);
  const did = useAtomValue(didAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useTracksQuery(did!);
  return (
    <TopTracks
      {...props}
      tracks={
        data?.map((track: any, index: number) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          image: track.album_art,
          uri: track.uri,
          albumUri: track.album_uri,
        })) ?? []
      }
      onSeeAll={() => {
        navigation.navigate("UserLibrary", { handle, tab: 3 });
      }}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
    />
  );
};

export default TopTracksWithData;
