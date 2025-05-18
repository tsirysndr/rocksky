import { didAtom } from "@/src/atoms/did";
import { useArtistsInfiniteQuery } from "@/src/hooks/useLibrary";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import * as R from "ramda";
import { useCallback, useMemo, useState } from "react";
import Artists from "./Artists";

const ArtistsWithData = () => {
  const [refreshing, setRefreshing] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { nowPlaying, isLoading: nowPlayingLoading } = useNowPlayingContext();
  const did = useAtomValue(didAtom);
  const { data: statsData } = useProfileStatsByDidQuery(did!);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useArtistsInfiniteQuery(did!, 15);

  const artists = useMemo(() => {
    if (!data) return [];

    return R.uniqBy(
      R.prop("id"),
      data.pages
        .flatMap((page) => page.artists)
        .map((artist, index) => ({
          id: artist.id,
          name: artist.name,
          image: artist.picture,
          uri: artist.uri,
          rank: index + 1,
        }))
    );
  }, [data]);

  const handleEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Artists
      artists={artists}
      total={statsData?.artists ?? 0}
      onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
      onEndReached={handleEndReached}
      isLoading={isLoading}
      isFetchingMore={isFetchingNextPage}
      onRefresh={async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
      }}
      refreshing={refreshing}
      className={`${nowPlayingLoading && nowPlaying ? "mb-[200px]" : "mb-[150px]"}`}
    />
  );
};

export default ArtistsWithData;
