import { useFeedByUriQuery } from "@/src/hooks/useFeed";
import {
  useArtistAlbumsQuery,
  useArtistTracksQuery,
  useSongByUriQuery,
} from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FC } from "react";
import { Linking } from "react-native";
import SongDetails from "./SongDetails";

type SongDetailsScreenRouteProp = RouteProp<RootStackParamList, "SongDetails">;

export type SongDetailsWithDataProps = Partial<{
  route: SongDetailsScreenRouteProp;
}>;

const SongDetailsWithData: FC<SongDetailsWithDataProps> = (props) => {
  const { route } = props;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const songResult = useSongByUriQuery(route?.params?.uri?.split("at://")[1]!);
  const scrobbleResult = useFeedByUriQuery(
    route?.params?.uri?.split("at://")[1]!
  );
  const song = songResult.data?.title ? songResult.data : scrobbleResult.data;
  const artistTracksResult = useArtistTracksQuery(
    song?.artistUri?.split("at://")[1]!
  );
  const artistAlbumsResult = useArtistAlbumsQuery(
    song?.artistUri?.split("at://")[1]!
  );
  return (
    <>
      {song && (
        <SongDetails
          song={{
            title: song.title,
            artist: song.artist,
            albumArtist: song.albumArtist,
            artistUri: song.artistUri,
            cover: song.cover,
            uri: song.uri,
            listeners: song.listeners,
            scrobbles: song.scrobbles,
          }}
          tracks={
            artistTracksResult.data?.map((track: any) => ({
              title: track.title,
              artist: track.artist,
              image: track.album_art,
              uri: track.uri,
              albumUri: track.album_uri,
              albumArtist: track.album_artist,
              cover: track.album_art,
            })) ?? []
          }
          albums={
            artistAlbumsResult.data?.map((album: any) => ({
              title: album.title,
              artist: album.artist,
              cover: album.album_art,
              uri: album.uri,
            })) ?? []
          }
          onViewOnPDSls={(uri) =>
            Linking.openURL(`https://pdsls.dev/${uri.replace("at://", "at/")}`)
          }
          onPressTrack={(uri) => {
            if (route?.params?.uri === uri) {
              return;
            }
            navigation.push("SongDetails", { uri });
          }}
          onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
          onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
        />
      )}
    </>
  );
};

export default SongDetailsWithData;
