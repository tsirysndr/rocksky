import { useTracksQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { FC } from "react";
import TopTracks from "./TopTracks";

export type TopTracksWithDataProps = {
  className?: string;
};

const TopTracksWithData: FC<TopTracksWithDataProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useTracksQuery("did:plc:7vdlgi2bflelz7mmuxoqjfcr");
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
