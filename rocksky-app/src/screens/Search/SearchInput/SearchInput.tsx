import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { zodResolver } from "@hookform/resolvers/zod";
import { FC, useEffect } from "react";
import { useForm } from "react-hook-form";
import { TextInput, View } from "react-native";
import { z } from "zod";

export type SearchInputProps = {
  className?: string;
  onSubmit?: (value: string) => void;
};

const schema = z.object({
  search: z.string().min(1, "Please enter a search term"),
});

type FormData = z.infer<typeof schema>;

const SearchInput: FC<SearchInputProps> = (props) => {
  const { className, onSubmit } = props;
  const { register, setValue, handleSubmit, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { search: "" },
  });

  // Register input on mount
  useEffect(() => {
    register("search");
  }, [register]);

  return (
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
        onChangeText={(text) => {
          setValue("search", text, { shouldValidate: true });
          handleSubmit((data) => onSubmit?.(data.search))();
        }}
        onSubmitEditing={handleSubmit((data) => onSubmit?.(data.search.trim()))}
        value={watch("search")}
        returnKeyType="search"
      />
      {watch("search")?.length > 0 && (
        <Ionicons
          className="absolute z-10 top-[23px] right-[10px]"
          name="close"
          size={24}
          color="#313131"
          onPress={() => {
            setValue("search", "");
            onSubmit?.("");
          }}
        />
      )}
    </View>
  );
};

export default SearchInput;
