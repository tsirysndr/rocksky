import {
  useArtistAlbumsQuery,
  useArtistQuery,
  useArtistTracksQuery,
} from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FC } from "react";
import { Linking } from "react-native";
import ArtistDetails from "./ArtistDetails";

type ArtistDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "ArtistDetails"
>;

export type ArtistDetailsWithDataProps = Partial<{
  route: ArtistDetailsScreenRouteProp;
}>;

const ArtistDetailsWithData: FC<ArtistDetailsWithDataProps> = (props) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { route } = props;
  const did = route?.params?.uri?.split("at://")[1]?.split("/")[0];
  const rkey = route?.params?.uri?.split("at://")[1]?.split("/")[2];
  const artistResult = useArtistQuery(did!, rkey!);
  const tracksResult = useArtistTracksQuery(
    route?.params?.uri?.split("at://")[1]!
  );
  const albumsResult = useArtistAlbumsQuery(
    route?.params?.uri?.split("at://")[1]!
  );
  return (
    <ArtistDetails
      artist={{
        id: artistResult.data?.id,
        name: artistResult.data?.name,
        picture: artistResult.data?.picture,
        uri: artistResult.data?.uri,
        listeners: artistResult.data?.listeners,
        scrobbles: artistResult.data?.scrobbles,
      }}
      albums={
        albumsResult.data?.map((album: any) => ({
          id: album.id,
          title: album.title,
          artist: album.artist,
          cover: album.album_art,
          uri: album.uri,
        })) ?? []
      }
      tracks={
        tracksResult.data?.map((track: any) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          image: track.album_art,
          uri: track.uri,
          albumUri: track.album_uri,
          albumArtist: track.album_artist,
          cover: track.album_art,
        })) ?? []
      }
      onViewOnPDSls={(uri) =>
        Linking.openURL(`https://pdsls.dev/${uri.replace("at://", "at/")}`)
      }
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
    />
  );
};

export default ArtistDetailsWithData;
