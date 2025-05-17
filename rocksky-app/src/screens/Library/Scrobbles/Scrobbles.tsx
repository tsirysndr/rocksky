import Song from "@/src/components/Song";
import numeral from "numeral";
import { FC } from "react";
import { Text, View } from "react-native";

export type ScrobblesProps = {
  scrobbles: {
    title: string;
    artist: string;
    image: string;
    listeningDate: string;
    uri: string;
    albumUri: string;
  }[];
  total: number;
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
};

const Scrobbles: FC<ScrobblesProps> = (props) => {
  const { scrobbles, total, onPressAlbum, onPressTrack } = props;
  return (
    <>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
        SCROBBLES
      </Text>
      <Text className="font-rockford-regular text-white text-[18px]">
        {numeral(total).format("0,0")}
      </Text>
      <View className="mt-[10px] mb-[100px]">
        {scrobbles.map((song, index) => (
          <Song
            key={index}
            image={song.image}
            title={song.title}
            artist={song.artist}
            size={60}
            className="mt-[10px]"
            listeningDate={song.listeningDate}
            onPress={onPressTrack}
            onPressAlbum={onPressAlbum}
            did={song.uri}
            albumUri={song.albumUri}
          />
        ))}
      </View>
    </>
  );
};

export default Scrobbles;
