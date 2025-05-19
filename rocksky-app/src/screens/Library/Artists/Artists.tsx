import Artist from "@/src/components/Artist";
import numeral from "numeral";
import { FC, memo, useCallback } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

export type ArtistsProps = {
  artists: {
    id: string;
    rank: number;
    name: string;
    image: string;
    uri: string;
  }[];
  total: number;
  onPressArtist: (uri: string) => void;
  onEndReached?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  className?: string;
};

const ArtistItem = memo(
  ({
    image,
    rank,
    name,
    size,
    onPress,
    className,
  }: {
    image: string;
    name: string;
    rank: number;
    size: number;
    onPress: () => void;
    className?: string;
  }) => (
    <Artist
      image={image}
      name={name}
      rank={rank}
      size={size}
      onPress={onPress}
      className={className}
      did=""
      row
    />
  )
);

const FooterLoader = memo(({ isLoading }: { isLoading: boolean }) => (
  <View className="flex-row justify-center items-center mt-2 h-[80px]">
    {isLoading && <ActivityIndicator size="large" color="#A0A0A0" />}
  </View>
));

const Artists: FC<ArtistsProps> = (props) => {
  const {
    artists,
    total,
    onPressArtist,
    onEndReached,
    isLoading,
    isFetchingMore,
    className,
    onRefresh,
    refreshing,
  } = props;

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <ArtistItem
        key={item.id}
        rank={item.rank}
        name={item.name}
        image={item.image}
        size={60}
        onPress={() => onPressArtist(item.uri)}
        className="mt-[10px]"
      />
    ),
    [onPressArtist]
  );

  const renderFooter = useCallback(
    () => <FooterLoader isLoading={isLoading || isFetchingMore} />,
    [isLoading, isFetchingMore]
  );

  return (
    <>
      <FlatList
        data={artists}
        className={className}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        keyExtractor={(item: {
          id: string;
          rank: number;
          name: string;
          image: string;
          uri: string;
        }) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListHeaderComponent={
          <>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              ARTISTS SCROBBLED
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(total).format("0,0")}
            </Text>
          </>
        }
        ListFooterComponent={renderFooter}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />
    </>
  );
};

export default Artists;
