import { FC, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

export type ChipsProps = {
  items: {
    key: string | number;
    label: string;
  }[];
  className?: string;
  onChange?: (key: string | number) => void;
  active?: string | number;
};

const Chips: FC<ChipsProps> = (props) => {
  const { className, items, onChange } = props;
  const [active, setActive] = useState(props.active || items[0].key);

  useEffect(() => {
    if (props.active !== undefined) {
      setActive(props.active);
    }
  }, [props.active]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className={`flex-row mt-5 mb-2 gap-4 ${className}`}>
        {items.map((item) => (
          <View
            key={item.key}
            className="bg-[#1d1c1c] rounded-full p-2 h-[34px]"
            style={{
              backgroundColor: active === item.key ? "#ff2876" : "#1d1c1c",
            }}
            onTouchEnd={() => {
              if (props.active === undefined) {
                setActive(item.key);
              }

              if (onChange) {
                onChange(item.key);
              }
            }}
          >
            <Text className="font-rockford-medium text-white pl-[5px] pr-[5px] mt-[-1px]">
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

export default Chips;
