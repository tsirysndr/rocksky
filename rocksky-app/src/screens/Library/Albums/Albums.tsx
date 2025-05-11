import numeral from "numeral";
import { Text } from "react-native";

const Albums = () => {
  return (
    <>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
        ALBUMS SCROBBLED
      </Text>
      <Text className="font-rockford-regular text-white text-[18px]">
        {numeral(1508).format("0,0")}
      </Text>
    </>
  );
};

export default Albums;
