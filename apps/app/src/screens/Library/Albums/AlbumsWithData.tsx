import { didAtom } from "@/src/atoms/did";
import { useAlbumsInfiniteQuery } from "@/src/hooks/useLibrary";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import * as R from "ramda";
import { FC, RefObject, useCallback, useMemo, useState } from "react";
import { FlatList } from "react-native-reanimated/lib/typescript/Animated";
import Albums from "./Albums";

export type AlbumsWithDataProps = {
  listRef: RefObject<FlatList<any> | null>;
  handleScroll: (event: any) => void;
};

const AlbumsWithData: FC<AlbumsWithDataProps> = (props) => {
  const [refreshing, setRefreshing] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const nowPlaying = useNowPlayingContext();
  const did = useAtomValue(didAtom);
  const { data: statsData } = useProfileStatsByDidQuery(did!);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useAlbumsInfiniteQuery(did!, 15);

  const albums = useMemo(() => {
    if (!data) return [];

    return R.uniqBy(
      R.prop("id"),
      data.pages
        .flatMap((page) => page.albums)
        .map((album, index) => ({
          id: album.id,
          title: album.title,
          artist: album.artist,
          cover: album.album_art,
          uri: album.uri,
          rank: index + 1,
        })),
    );
  }, [data]);

  const handleEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Albums
      albums={albums}
      total={statsData?.albums ?? 0}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
      onEndReached={handleEndReached}
      isLoading={isLoading}
      isFetchingMore={isFetchingNextPage}
      onRefresh={async () => {
        setRefreshing(true);
        setTimeout(() => {
          setRefreshing(false);
        }, 1000);
        await refetch();
      }}
      refreshing={refreshing}
      className={`${nowPlaying ? "mb-[200px]" : "mb-[150px]"}`}
      {...props}
    />
  );
};

export default AlbumsWithData;
