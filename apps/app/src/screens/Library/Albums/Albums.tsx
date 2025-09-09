import Album from "@/src/components/Album";
import numeral from "numeral";
import { FC, memo, RefObject, useCallback } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

export type AlbumsProps = {
  albums: {
    id: string;
    artist: string;
    title: string;
    cover: string;
    uri: string;
    rank: number;
  }[];
  total: number;
  onPressAlbum: (uri: string) => void;
  onEndReached?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  className?: string;
  listRef: RefObject<FlatList<any> | null>;
  handleScroll: (event: any) => void;
};

const AlbumItem = memo(
  ({
    image,
    artist,
    title,
    size,
    rank,
    onPress,
    className,
  }: {
    image: string;
    artist: string;
    title: string;
    size: number;
    rank: number;
    onPress: () => void;
    className?: string;
  }) => (
    <Album
      image={image}
      artist={artist}
      title={title}
      size={size}
      rank={rank}
      onPress={onPress}
      className={className}
      did=""
      row
    />
  ),
);

const FooterLoader = memo(({ isLoading }: { isLoading: boolean }) => (
  <View className="flex-row justify-center items-center mt-2 h-[80px]">
    {isLoading && <ActivityIndicator size="large" color="#A0A0A0" />}
  </View>
));

const Albums: FC<AlbumsProps> = (props) => {
  const {
    albums,
    total,
    onPressAlbum,
    onEndReached,
    onRefresh,
    refreshing,
    isLoading,
    isFetchingMore,
    className,
    listRef,
    handleScroll,
  } = props;

  const renderItem = useCallback(
    ({ item }: any) => (
      <AlbumItem
        key={item.id}
        image={item.cover}
        artist={item.artist}
        title={item.title}
        size={60}
        rank={item.rank}
        onPress={() => onPressAlbum(item.uri)}
        className="mt-[15px]"
      />
    ),
    [onPressAlbum],
  );

  const renderFooter = useCallback(
    () => <FooterLoader isLoading={isLoading || isFetchingMore} />,
    [isLoading, isFetchingMore],
  );

  return (
    <>
      <FlatList
        ref={listRef}
        onScroll={handleScroll}
        data={albums}
        className={className}
        initialNumToRender={5}
        keyExtractor={(item: {
          id: string;
          artist: string;
          title: string;
          cover: string;
          uri: string;
        }) => item.id}
        removeClippedSubviews={true}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListHeaderComponent={
          <>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              ALBUMS SCROBBLED
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

export default Albums;
