import numeral from "numeral";
import { Text } from "react-native";

const Artists = () => {
  return (
    <>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
        ARTISTS SCROBBLED
      </Text>
      <Text className="font-rockford-regular text-white text-[18px]">
        {numeral(716).format("0,0")}
      </Text>
    </>
  );
};

export default Artists;
