import {
  useArtistAlbumsQuery,
  useArtistQuery,
  useArtistTracksQuery,
} from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp } from "@react-navigation/native";
import { FC } from "react";
import ArtistDetails from "./ArtistDetails";

type ArtistDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "ArtistDetails"
>;

export type ArtistDetailsWithDataProps = Partial<{
  route: ArtistDetailsScreenRouteProp;
}>;

const ArtistDetailsWithData: FC<ArtistDetailsWithDataProps> = (props) => {
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
        name: artistResult.data?.name,
        picture: artistResult.data?.picture,
        uri: artistResult.data?.uri,
        listeners: artistResult.data?.listeners,
        scrobbles: artistResult.data?.scrobbles,
      }}
      albums={
        albumsResult.data?.map((album: any) => ({
          title: album.title,
          artist: album.artist,
          cover: album.album_art,
          uri: album.uri,
        })) ?? []
      }
      tracks={
        tracksResult.data?.map((track: any) => ({
          title: track.title,
          artist: track.artist,
          image: track.album_art,
          uri: track.uri,
          albumUri: track.album_uri,
          albumArtist: track.album_artist,
          cover: track.album_art,
        })) ?? []
      }
      onViewOnPDSls={(did) => {}}
    />
  );
};

export default ArtistDetailsWithData;
