import { didAtom } from "@/src/atoms/did";
import {
  useProfileStatsByDidQuery,
  useRecentTracksByDidInfiniteQuery,
} from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import * as R from "ramda";
import { FC, RefObject, useCallback, useMemo, useState } from "react";
import { FlatList } from "react-native";
import Scrobbles from "./Scrobbles";

export type ScrobblesWithDataProps = {
  listRef: RefObject<FlatList<any> | null>;
  handleScroll: (event: any) => void;
};

const ScrobblesWithData: FC<ScrobblesWithDataProps> = (props) => {
  const [refreshing, setRefreshing] = useState(false);
  const nowPlaying = useNowPlayingContext();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const did = useAtomValue(didAtom);
  const { data: statsData } = useProfileStatsByDidQuery(did!);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useRecentTracksByDidInfiniteQuery(did!, 20);

  const scrobbles = useMemo(() => {
    if (!data) return [];

    return R.uniqBy(
      R.prop("id"),
      data.pages
        .flatMap((page) => page.tracks)
        .map((scrobble) => ({
          id: scrobble.id,
          title: scrobble.title,
          artist: scrobble.artist,
          image: scrobble.album_art!,
          listeningDate: dayjs.utc(scrobble.created_at).local().fromNow(),
          uri: scrobble.uri,
          albumUri: scrobble.album_uri,
        })),
    );
  }, [data]);

  const handleEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Scrobbles
      scrobbles={scrobbles}
      total={statsData?.scrobbles ?? 0}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
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

export default ScrobblesWithData;
