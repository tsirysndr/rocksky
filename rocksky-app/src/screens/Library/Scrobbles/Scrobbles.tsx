import Song from "@/src/components/Song";
import numeral from "numeral";
import { FC, memo, RefObject, useCallback } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

export type ScrobblesProps = {
  scrobbles: {
    id: string;
    title: string;
    artist: string;
    image: string;
    listeningDate: string;
    uri: string;
    albumUri: string;
  }[];
  total: number;
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
  onEndReached: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  className?: string;
  listRef: RefObject<FlatList<any> | null>;
  handleScroll: (event: any) => void;
};

const SongItem = memo(
  ({
    image,
    title,
    artist,
    size,
    onPress,
    onPressAlbum,
    albumUri,
    className,
    listeningDate,
  }: {
    image: string;
    title: string;
    artist: string;
    size: number;
    onPress: () => void;
    onPressAlbum: () => void;
    albumUri: string;
    className?: string;
    listeningDate: string;
  }) => (
    <Song
      image={image}
      title={title}
      artist={artist}
      size={size}
      onPress={onPress}
      onPressAlbum={onPressAlbum}
      albumUri={albumUri}
      className={className}
      listeningDate={listeningDate}
      did=""
    />
  )
);

const FooterLoader = memo(({ isLoading }: { isLoading: boolean }) => (
  <View className="flex-row justify-center items-center mt-2 h-[80px]">
    {isLoading && <ActivityIndicator size="large" color="#A0A0A0" />}
  </View>
));

const Scrobbles: FC<ScrobblesProps> = (props) => {
  const {
    scrobbles,
    total,
    onPressAlbum,
    onPressTrack,
    onEndReached,
    isLoading,
    isFetchingMore,
    refreshing,
    onRefresh,
    className,
    listRef,
    handleScroll,
  } = props;

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <SongItem
        key={item.id}
        image={item.image}
        title={item.title}
        artist={item.artist}
        size={60}
        className="mt-[10px]"
        listeningDate={item.listeningDate}
        onPress={() => onPressTrack(item.uri)}
        onPressAlbum={() => onPressAlbum(item.albumUri)}
        albumUri={item.albumUri}
      />
    ),
    [onPressTrack, onPressAlbum]
  );

  const renderFooter = useCallback(
    () => <FooterLoader isLoading={isLoading || isFetchingMore} />,
    [isLoading, isFetchingMore]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 70,
      offset: 70 * index,
      index,
    }),
    []
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
        data={scrobbles}
        className={className}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        keyExtractor={(item: {
          id: string;
          title: string;
          artist: string;
          image: string;
          listeningDate: string;
          uri: string;
          albumUri: string;
        }) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        getItemLayout={getItemLayout}
        onRefresh={onRefresh}
        refreshing={refreshing}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        ListHeaderComponent={() => (
          <>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
              SCROBBLES
            </Text>
            <Text className="font-rockford-regular text-white text-[18px]">
              {numeral(total).format("0,0")}
            </Text>
          </>
        )}
      />
    </>
  );
};

export default Scrobbles;
