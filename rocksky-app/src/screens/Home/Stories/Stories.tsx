import { NowPlayings } from "@/src/hooks/useNowPlaying";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { FC, memo } from "react";
import { FlatList } from "react-native";
import Avatar from "./Avatar";

dayjs.extend(relativeTime);
dayjs.extend(utc);

export type StoriesProps = {
  nowPlayings?: NowPlayings;
};

const StoryItem = memo(
  ({ item, onPress }: { item: NowPlayings[number]; onPress: () => void }) => (
    <Avatar
      key={item.id}
      name={item.handle}
      image={item.avatar}
      size={72}
      className="mr-[10px]"
      onPress={onPress}
    />
  )
);

const Stories: FC<StoriesProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { nowPlayings } = props;

  const renderItem = ({
    item,
    index,
  }: {
    item: NowPlayings[number];
    index: number;
  }) => (
    <StoryItem
      item={item}
      onPress={() => {
        navigation.navigate("Story", {
          index,
        });
      }}
    />
  );

  return (
    <>
      <FlatList
        data={nowPlayings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews
        contentContainerStyle={{
          paddingTop: 16,
        }}
      />
    </>
  );
};

export default Stories;
