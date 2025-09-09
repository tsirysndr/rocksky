import Song from "@/src/components/Song";
import numeral from "numeral";
import { FC, memo, RefObject, useCallback } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

export type TracksProps = {
  tracks: {
    id: string;
    title: string;
    artist: string;
    image: string;
    uri: string;
    albumUri: string;
    rank: number;
  }[];
  total: number;
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
  onEndReached?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isLoading?: boolean;
  isFetchingMore?: boolean;
  className?: string;
  listRef: RefObject<FlatList<any> | null>;
  handleScroll: (event: any) => void;
};

const SongItem = memo(
  ({
    image,
    rank,
    title,
    artist,
    size,
    onPress,
    onPressAlbum,
    albumUri,
    className,
  }: {
    image: string;
    title: string;
    rank: number;
    artist: string;
    size: number;
    onPress: () => void;
    onPressAlbum: () => void;
    albumUri: string;
    className?: string;
  }) => (
    <Song
      image={image}
      title={title}
      rank={rank}
      artist={artist}
      size={size}
      onPress={onPress}
      onPressAlbum={onPressAlbum}
      albumUri={albumUri}
      className={className}
      did=""
    />
  ),
);

const FooterLoader = memo(({ isLoading }: { isLoading: boolean }) => (
  <View className="flex-row justify-center items-center mt-2 h-[80px]">
    {isLoading && <ActivityIndicator size="large" color="#A0A0A0" />}
  </View>
));

const Tracks: FC<TracksProps> = (props) => {
  const {
    tracks,
    total,
    onPressTrack,
    onPressAlbum,
    onEndReached,
    onRefresh,
    isLoading = false,
    isFetchingMore = false,
    refreshing = false,
    className,
    listRef,
    handleScroll,
  } = props;

  const renderItem = useCallback(
    ({ item }: any) => (
      <SongItem
        key={`${item.rank}_${item.id}`}
        rank={item.rank}
        image={item.image}
        title={item.title}
        artist={item.artist}
        size={60}
        className="mt-[10px]"
        onPress={() => onPressTrack(item.uri)}
        onPressAlbum={() => onPressAlbum(item.albumUri)}
        albumUri={item.albumUri}
      />
    ),
    [onPressTrack, onPressAlbum],
  );

  const renderFooter = useCallback(
    () => <FooterLoader isLoading={isLoading || isFetchingMore} />,
    [isLoading, isFetchingMore],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 70,
      offset: 70 * index,
      index,
    }),
    [],
  );

  const handleEndReached = useCallback(() => {
    if (onEndReached && !isLoading && !isFetchingMore) {
      onEndReached();
    }
  }, [onEndReached, isLoading, isFetchingMore]);

  return (
    <>
      <FlatList
        ref={listRef}
        onScroll={handleScroll}
        data={tracks}
        className={className}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={21}
        removeClippedSubviews={true}
        keyExtractor={(item: {
          id: string;
          title: string;
          artist: string;
          image: string;
          uri: string;
          albumUri: string;
          rank: number;
        }) => `${item.rank}_${item.id}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              TRACKS SCROBBLED
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(total).format("0,0")}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text className="text-center text-[#A0A0A0] mt-10">
            No tracks found.
          </Text>
        }
        ListFooterComponent={renderFooter}
        getItemLayout={getItemLayout}
        onRefresh={onRefresh}
        refreshing={refreshing}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />
    </>
  );
};

export default Tracks;
