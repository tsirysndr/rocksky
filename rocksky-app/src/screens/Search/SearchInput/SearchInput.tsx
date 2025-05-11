import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FC } from "react";
import { TextInput, View } from "react-native";

export type SearchInputProps = {
  className?: string;
};

const SearchInput: FC<SearchInputProps> = (props) => {
  const { className } = props;
  return (
    <>
      <View className={`relative ${className}`}>
        <Feather
          className="absolute z-10 top-[23px] left-[10px]"
          name="search"
          size={24}
          color="#313131"
        />
        <TextInput
          className="font-rockford-medium bg-[#fff] text-[#000] rounded-[2px] p-[10px] mt-[10px] h-[49px] text-[18px] pl-[46px] pr-[46px]"
          placeholder="Search"
          placeholderTextColor="#A0A0A0"
          cursorColor="#000"
        />
        <Ionicons
          className="absolute z-10 top-[23px] right-[10px]"
          name="close"
          size={24}
          color="#313131"
        />
      </View>
    </>
  );
};

export default SearchInput;
