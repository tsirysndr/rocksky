import { useAlbumQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import {
  NavigationProp,
  RouteProp,
  useNavigation,
} from "@react-navigation/native";
import { FC } from "react";
import { Linking } from "react-native";
import AlbumDetails from "./AlbumDetails";

type AlbumDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "AlbumDetails"
>;

export type AlbumDetailsWithDataProps = Partial<{
  route: AlbumDetailsScreenRouteProp;
}>;

const AlbumDetailsWithData: FC<AlbumDetailsWithDataProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { route } = props;
  const did = route?.params?.uri?.split("at://")[1]?.split("/")[0];
  const rkey = route?.params?.uri?.split("at://")[1]?.split("/")[2];
  const { data, isLoading } = useAlbumQuery(did!, rkey!);
  return (
    <>
      {!isLoading && data && (
        <AlbumDetails
          album={{
            albumArt: data.album_art,
            title: data.title,
            artist: data.artist,
            artistUri: data.artist_uri,
            uri: data.uri,
            year: data.year,
            releaseDate: data.release_date,
            label: data.label,
            scrobbles: data.scrobbles,
            listeners: data.listeners,
            tracks: data.tracks.map((track: any) => ({
              id: track.xata_id,
              title: track.title,
              artist: track.album_artist,
              artistUri: track.artist_uri,
              trackNumber: track.track_number,
              discNumber: track.disc_number,
              uri: track.uri,
            })),
          }}
          onPressArtist={() =>
            navigation.navigate("ArtistDetails", { uri: data.artist_uri })
          }
          onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
          onViewOnPDSls={(did: string) => Linking.openURL(`https://pdsls.dev`)}
        />
      )}
    </>
  );
};

export default AlbumDetailsWithData;
