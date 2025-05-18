import { didAtom } from "@/src/atoms/did";
import { useInfiniteTracksQuery } from "@/src/hooks/useLibrary";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import Tracks from "./Tracks";

const TracksWithData = () => {
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
  } = useInfiniteTracksQuery(did!, 15);

  const tracks = useMemo(() => {
    if (!data) return [];

    return data.pages
      .flatMap((page) => page.tracks)
      .map((track, index) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        image: track.album_art,
        uri: track.uri,
        albumUri: track.album_uri,
        rank: index + 1,
      }));
  }, [data]);

  const handleEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Tracks
      tracks={tracks}
      total={statsData?.tracks ?? 0}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
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

export default TracksWithData;
