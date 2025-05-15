import { didAtom } from "@/src/atoms/did";
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
  const did = useAtomValue(didAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useTracksQuery(did!);
  return (
    <TopTracks
      {...props}
      tracks={
        data?.map((track: any, index: number) => ({
          title: track.title,
          artist: track.artist,
          image: track.album_art,
        })) ?? []
      }
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressTrack={(did) => navigation.navigate("SongDetails")}
      onPressAlbum={() => navigation.navigate("AlbumDetails")}
    />
  );
};

export default TopTracksWithData;
