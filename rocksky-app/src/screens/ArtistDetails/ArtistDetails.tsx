import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import numeral from "numeral";
import { FC } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import TopAlbums from "../Profile/Overview/TopAlbums/TopAlbums";

export type SongDetailsProps = {
  artist: {
    name: string;
    picture: string;
    listeners: number;
    scrobbles: number;
    uri: string;
  };
  tracks: {
    title: string;
    artist: string;
    albumArtist: string;
    cover: string;
    uri: string;
    albumUri: string;
  }[];
  albums: {
    title: string;
    artist: string;
    cover: string;
    uri: string;
  }[];
  onViewOnPDSls: (did: string) => void;
  onPressAlbum: (uri: string) => void;
  onPressTrack: (uri: string) => void;
};

const ArtistDetails: FC<SongDetailsProps> = (props) => {
  const { artist, tracks, albums, onPressTrack, onPressAlbum } = props;
  return (
    <View className="w-full h-full bg-black pt-[50px]">
      <ScrollView
        className="h-[99%] w-full pl-[15px] pr-[15px]"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center justify-start">
          <Image
            source={{
              uri: artist.picture,
            }}
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
            }}
          />
          <Text className="font-rockford-medium text-[#fff] mt-[10px] text-center text-[20px]">
            {artist.name}
          </Text>
        </View>

        <View className="flex-row">
          <View className="mr-[20px]">
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              Listeners
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(artist.listeners).format("0,0")}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              Scrobbles
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(artist.scrobbles).format("0,0")}
            </Text>
          </View>
          <View>
            <Pressable onPress={() => props.onViewOnPDSls(props.artist.uri)}>
              <View className="h-[40px] flex-row items-center justify-center mt-[10px]">
                <Text className="font-rockford-regular text-white text-[14px]  mr-[10px]">
                  View on PDSls
                </Text>
                <FontAwesome name="external-link" size={18} color="white" />
              </View>
            </Pressable>
          </View>
        </View>

        <View>
          <Text className="font-rockford-regular text-white text-[14px] mt-[35px] ">
            Popular Tracks by
          </Text>
          <Text className="font-rockford-medium text-white text-[18px] mt-[-5px] ">
            {artist.name}
          </Text>
        </View>

        <View className="mt-[15px]">
          {tracks.map((track, index) => (
            <Song
              key={index}
              title={track.title}
              artist={track.artist}
              image={track.cover}
              onPress={() => onPressTrack(track.uri)}
              onOpenProfile={() => {}}
              onPressAlbum={() => onPressAlbum(track.albumUri)}
              withoutAlbumCover={false}
              size={60}
              className="mb-[15px]"
              did=""
              albumUri=""
            />
          ))}
        </View>

        <View className="mt-[25px] mb-[100px]">
          <Text className="font-rockford-regular text-white text-[14px]">
            Popular Albums by
          </Text>
          <Text className="font-rockford-medium text-white text-[18px] mt-[-5px] ">
            {artist.name}
          </Text>

          <TopAlbums
            albums={
              albums?.map((album: any) => ({
                artist: album.artist,
                title: album.title,
                image: album.cover,
                uri: album.uri,
              })) ?? []
            }
            onSeeAll={() => {}}
            onPressAlbum={(uri) => onPressAlbum(uri)}
            withoutSeeAll
            withoutTitle
          />
        </View>
      </ScrollView>
      <View className="w-full absolute bottom-0 bg-black">
        <StickyPlayer />
      </View>
    </View>
  );
};

export default ArtistDetails;
