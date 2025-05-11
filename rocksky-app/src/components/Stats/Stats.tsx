import numeral from "numeral";
import { FC } from "react";
import { Text, View } from "react-native";

export type StatsProps = {
  scrobbles: number;
  artists: number;
  lovedTracks: number;
};

const Stats: FC<StatsProps> = (props) => {
  const { scrobbles, artists, lovedTracks } = props;
  return (
    <View className="flex flex-row items-center">
      <View>
        <Text className="font-rockford-regular text-[#A0A0A0]">SCROBBLES</Text>
        <Text className="font-rockford-regular text-white text-[18px]">
          {numeral(scrobbles).format("0,0")}
        </Text>
      </View>
      <View className="ml-[10px]">
        <Text className="font-rockford-regular text-[#A0A0A0] ">ARTISTS</Text>
        <Text className="font-rockford-regular text-white text-[18px]">
          {numeral(artists).format("0,0")}
        </Text>
      </View>
      <View className="ml-[10px]">
        <Text className="font-rockford-regular text-[#A0A0A0]">
          LOVED TRACKS
        </Text>
        <Text className="font-rockford-regular text-white text-[18px]">
          {numeral(lovedTracks).format("0,0")}
        </Text>
      </View>
    </View>
  );
};

export default Stats;
