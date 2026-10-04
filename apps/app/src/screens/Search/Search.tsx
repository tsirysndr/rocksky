import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { UploadedTrack } from "@/src/api/uploads";
import { authTokenAtom } from "@/src/atoms/auth";
import {
  AddToPlaylistSheet,
  PickerSheet,
  styles as sheetStyles,
} from "@/src/components/PlaylistSheets";
import { Text } from "@/src/components/Text";
import ThemedSwitch from "@/src/components/ThemedSwitch";
import { useSearchQuery } from "@/src/hooks/useSearch";
import { useUploadsInfiniteQuery } from "@/src/hooks/useUploads";
import {
  playUploadedTracks,
  queueTracks,
  uploadToQueueTrack,
} from "@/src/lib/libraryPlayback";
import type { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";

type ResultItem = {
  id: string;
  title?: string;
  name?: string;
  display_name?: string;
  artist?: string;
  albumArt?: string;
  picture?: string;
  avatar?: string;
  uri?: string;
  did?: string;
  handle?: string;
  _federation?: { indexUid: string };
};

function SearchResultRow({
  item,
  onPress,
  onMore,
}: {
  item: ResultItem;
  onPress: () => void;
  onMore?: () => void;
}) {
  const table = item._federation?.indexUid ?? "tracks";
  const isRound = table === "artists" || table === "users";
  const cover = item.albumArt || item.picture || item.avatar;
  const title = item.display_name || item.title || item.name;
  const subtitle =
    table === "users"
      ? `@${item.handle}`
      : table === "artists"
        ? (item.artist ?? "Artist")
        : table === "albums"
          ? (item.artist ?? "Album")
          : (item.artist ?? "Track");
  const typeLabel =
    table === "users"
      ? "user"
      : table === "artists"
        ? "artist"
        : table === "albums"
          ? "album"
          : "track";

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onMore}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: isRound ? 24 : 8,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: 48, height: 48 }} />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 18, opacity: 0.2 }}>
              {isRound ? "♬" : "♪"}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 13, fontWeight: "600", color: colors.text }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: colors.textMuted }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 20,
          backgroundColor: colors.surface2,
        }}
      >
        <Text style={{ fontSize: 10, color: colors.textMuted }}>
          {typeLabel}
        </Text>
      </View>
      {onMore && (
        <TouchableOpacity
          accessibilityLabel="Track actions"
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onMore();
          }}
        >
          <Feather name="more-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function Search() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const token = useAtomValue(authTokenAtom);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const library = libraryOnly && !!token;
  const [menuTrack, setMenuTrack] = useState<UploadedTrack | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<UploadedTrack | null>(
    null,
  );
  useEffect(() => {
    if (!token) {
      setLibraryOnly(false);
      setMenuTrack(null);
      setPlaylistTrack(null);
    }
  }, [token]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const { data, isLoading } = useSearchQuery(debouncedQuery, !library);
  const libraryQuery = useUploadsInfiniteQuery(
    debouncedQuery,
    library && !!debouncedQuery.trim(),
  );
  const libraryTracks = libraryQuery.data?.pages.flat() ?? [];
  const results: ResultItem[] = data?.hits || [];

  const handlePressItem = (item: ResultItem) => {
    const table = item._federation?.indexUid ?? "tracks";
    if (table === "tracks" && item.uri)
      navigation.navigate("SongDetails", { uri: item.uri });
    else if (table === "albums" && item.uri)
      navigation.navigate("AlbumDetails", { uri: item.uri });
    else if (table === "artists" && item.uri)
      navigation.navigate("ArtistDetails", { uri: item.uri });
    else if (table === "users" && item.did)
      navigation.navigate("UserProfile", { did: item.did });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 12,
              }}
            >
              Search
            </Text>

            {/* Search bar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: colors.surface2,
              }}
            >
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: colors.text,
                  fontFamily: "RockfordSansRegular",
                }}
                placeholder={
                  library
                    ? "Search tracks in your library"
                    : "Songs, artists, albums..."
                }
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setQuery("");
                    setDebouncedQuery("");
                  }}
                >
                  <Feather name="x" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {!!token && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingBottom: 12,
              }}
            >
              <Text>Library</Text>
              <ThemedSwitch
                accessibilityLabel="Search only my library"
                value={library}
                onValueChange={setLibraryOnly}
              />
            </View>
          )}
          {library && (
            <FlatList
              data={libraryTracks}
              keyExtractor={(item) => item.upload.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 20,
              }}
              onEndReached={() => {
                if (
                  libraryQuery.hasNextPage &&
                  !libraryQuery.isFetchingNextPage
                )
                  void libraryQuery.fetchNextPage();
              }}
              renderItem={({ item, index }) => (
                <SearchResultRow
                  item={{
                    ...item.track,
                    uri: item.track.uri ?? undefined,
                    albumArt: item.track.albumArt ?? undefined,
                  }}
                  onPress={() => {
                    void playUploadedTracks(libraryTracks, index);
                  }}
                  onMore={() => setMenuTrack(item)}
                />
              )}
              ListEmptyComponent={
                libraryQuery.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text
                    style={{
                      color: colors.textMuted,
                      textAlign: "center",
                      paddingVertical: 48,
                    }}
                  >
                    {!debouncedQuery.trim()
                      ? "Search tracks in your library"
                      : libraryQuery.isError
                        ? "Could not search your library"
                        : "No tracks found in your library"}
                  </Text>
                )
              }
              ListFooterComponent={
                libraryQuery.isError ? (
                  <TouchableOpacity onPress={() => void libraryQuery.refetch()}>
                    <Text>Retry</Text>
                  </TouchableOpacity>
                ) : libraryQuery.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : null
              }
            />
          )}
          {!library && (
            <>
              {/* Loading */}
              {isLoading && (
                <View style={{ alignItems: "center", paddingVertical: 48 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}

              {/* Empty state */}
              {!isLoading && !debouncedQuery && (
                <View
                  style={{
                    alignItems: "center",
                    paddingVertical: 64,
                    paddingHorizontal: 32,
                  }}
                >
                  <Text
                    style={{ fontSize: 48, opacity: 0.2, marginBottom: 12 }}
                  >
                    🎵
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.textMuted,
                      textAlign: "center",
                    }}
                  >
                    Search for songs, artists, and albums
                  </Text>
                </View>
              )}

              {/* No results */}
              {!isLoading && debouncedQuery && results.length === 0 && (
                <View
                  style={{
                    alignItems: "center",
                    paddingVertical: 64,
                    paddingHorizontal: 32,
                  }}
                >
                  <Feather
                    name="search"
                    size={48}
                    color={colors.textMuted}
                    style={{ opacity: 0.2, marginBottom: 12 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.textMuted,
                      textAlign: "center",
                    }}
                  >
                    No results for "{debouncedQuery}"
                  </Text>
                </View>
              )}

              {/* Results */}
              {!isLoading && results.length > 0 && (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 20,
                  }}
                >
                  {results.map((item, i) => (
                    <SearchResultRow
                      key={item.uri || item.id || i}
                      item={item}
                      onPress={() => handlePressItem(item)}
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      {menuTrack && token && (
        <PickerSheet
          title={menuTrack.track.title}
          artwork={menuTrack.track.albumArt || null}
          subtitle={menuTrack.track.artist}
          onClose={() => setMenuTrack(null)}
        >
          {[
            {
              label: "Play next",
              action: () =>
                queueTracks([uploadToQueueTrack(menuTrack)], "next"),
            },
            {
              label: "Add to queue (last)",
              action: () =>
                queueTracks([uploadToQueueTrack(menuTrack)], "last"),
            },
            {
              label: "Add to playlist…",
              action: () => setPlaylistTrack(menuTrack),
            },
          ].map(({ label, action }) => (
            <TouchableOpacity
              key={label}
              style={sheetStyles.row}
              onPress={() => {
                setMenuTrack(null);
                void action();
              }}
            >
              <Text>{label}</Text>
            </TouchableOpacity>
          ))}
        </PickerSheet>
      )}
      {playlistTrack && token && (
        <AddToPlaylistSheet
          songId={playlistTrack.track.id}
          onClose={() => setPlaylistTrack(null)}
        />
      )}
    </SafeAreaView>
  );
}
