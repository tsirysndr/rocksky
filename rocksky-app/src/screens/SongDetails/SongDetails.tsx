import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import numeral from "numeral";
import { FC } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import TopAlbums from "../Profile/Overview/TopAlbums/TopAlbums";

export type SongDetailsProps = {
  song: {
    title: string;
    artist: string;
    albumArtist: string;
    cover: string;
    uri: string;
    artistUri: string;
    listeners: number;
    scrobbles: number;
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
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
  onPressArtist: (did: string) => void;
};

const SongDetails: FC<SongDetailsProps> = (props) => {
  return (
    <View className="w-full h-full bg-black pt-[50px]">
      <ScrollView
        className="h-[99%] w-full pl-[15px] pr-[15px]"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center justify-start">
          <Image
            source={{
              uri: props.song.cover,
            }}
            style={{
              width: 200,
              height: 200,
            }}
          />
          <Text
            className="font-rockford-medium text-[#fff] mt-[10px] text-center"
            style={{ fontSize: 18 }}
          >
            {props.song.title}
          </Text>
          <Pressable onPress={() => props.onPressArtist(props.song.artistUri)}>
            <Text className="font-rockford-medium text-[#A0A0A0] text-[14px] mt-[5px] text-center">
              {props.song.artist}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row">
          <View className="mr-[20px]">
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              Listeners
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(props.song.listeners).format("0,0")}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              Scrobbles
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(props.song.scrobbles).format("0,0")}
            </Text>
          </View>
          <View>
            <Pressable onPress={() => props.onViewOnPDSls(props.song.uri)}>
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
            {props.song.albumArtist}
          </Text>
        </View>

        <View className="mt-[15px]">
          {props.tracks.map((track, index) => (
            <Song
              key={index}
              title={track.title}
              artist={track.artist}
              image={track.cover}
              onPress={() => props.onPressTrack(track.uri)}
              onOpenProfile={() => {}}
              onPressAlbum={() => props.onPressAlbum(track.albumUri)}
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
            {props.song.albumArtist}
          </Text>

          <TopAlbums
            albums={
              props.albums?.map((album: any) => ({
                artist: album.artist,
                title: album.title,
                image: album.cover,
                uri: album.uri,
              })) ?? []
            }
            onSeeAll={() => {}}
            onPressAlbum={(uri) => props.onPressAlbum(uri)}
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

export default SongDetails;
