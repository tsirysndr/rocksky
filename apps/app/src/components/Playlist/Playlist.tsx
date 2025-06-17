import { Image } from "expo-image";
import numeral from "numeral";
import { FC } from "react";
import { Text, useWindowDimensions, View } from "react-native";

export type PlaylistProps = {
  cover: string;
  title: string;
  tracks: number;
};

const Playlist: FC<PlaylistProps> = (props) => {
  const { cover, title, tracks } = props;
  const layout = useWindowDimensions();
  return (
    <View>
      <Image
        source={{
          uri: cover,
        }}
        style={{
          width: layout.width / 3 - 20,
          height: layout.width / 3 - 20,
        }}
      />
      <Text
        className="font-rockford-regular text-white mt-[8px]"
        style={{
          width: layout.width / 3 - 20,
        }}
      >
        {title}
      </Text>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[13px] mb-[30px]">
        {numeral(tracks).format("0,0")} tracks
      </Text>
    </View>
  );
};

export default Playlist;
