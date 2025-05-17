import Artist from "@/src/components/Artist";
import numeral from "numeral";
import { FC } from "react";
import { Text, View } from "react-native";

export type ArtistsProps = {
  artists: {
    rank: number;
    name: string;
    image: string;
    uri: string;
  }[];
  total: number;
  onPressArtist: (uri: string) => void;
};

const Artists: FC<ArtistsProps> = (props) => {
  const { artists, total, onPressArtist } = props;
  return (
    <>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
        ARTISTS SCROBBLED
      </Text>
      <Text className="font-rockford-regular text-white text-[18px]">
        {numeral(total).format("0,0")}
      </Text>
      <View className="mb-[100px]">
        {artists.map((artist, index) => (
          <Artist
            row
            size={68}
            key={index}
            rank={artist.rank}
            name={artist.name}
            image={artist.image}
            className="mt-[20px]"
            did={artist.uri}
            onPress={onPressArtist}
          />
        ))}
      </View>
    </>
  );
};

export default Artists;
