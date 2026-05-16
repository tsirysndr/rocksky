import Feather from "@expo/vector-icons/Feather";
import { colors } from "@/src/theme";
import { useSearchQuery } from "@/src/hooks/useSearch";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Text } from "@/src/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";

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
  [key: string]: any;
};

function SearchResultRow({ item, onPress }: { item: ResultItem; onPress: () => void }) {
  const table = item._federation?.indexUid ?? "tracks";
  const isRound = table === "artists" || table === "users";
  const cover = item.albumArt || item.picture || item.avatar;
  const title = item.display_name || item.title || item.name;
  const subtitle =
    table === "users" ? `@${item.handle}` :
    table === "artists" ? item.artist ?? "Artist" :
    table === "albums" ? item.artist ?? "Album" :
    item.artist ?? "Track";
  const typeLabel =
    table === "users" ? "user" :
    table === "artists" ? "artist" :
    table === "albums" ? "album" : "track";

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
    >
      <View style={{ width: 48, height: 48, borderRadius: isRound ? 24 : 8, overflow: "hidden", backgroundColor: colors.surface2 }}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: 48, height: 48 }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18, opacity: 0.2 }}>{isRound ? "♬" : "♪"}</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: colors.surface2 }}>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>{typeLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function Search() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const { data, isLoading } = useSearchQuery(debouncedQuery);
  const results: ResultItem[] = data?.hits || [];

  const handlePressItem = (item: ResultItem) => {
    const table = item._federation?.indexUid ?? "tracks";
    if (table === "tracks" && item.uri) navigation.navigate("SongDetails", { uri: item.uri });
    else if (table === "albums" && item.uri) navigation.navigate("AlbumDetails", { uri: item.uri });
    else if (table === "artists" && item.uri) navigation.navigate("ArtistDetails", { uri: item.uri });
    else if (table === "users" && item.did) navigation.navigate("UserProfile", { did: item.did });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 12 }}>Search</Text>

              {/* Search bar */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.surface2 }}>
                <Feather name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: colors.text, fontFamily: "RockfordSansRegular" }}
                  placeholder="Songs, artists, albums..."
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => { setQuery(""); setDebouncedQuery(""); }}>
                    <Feather name="x" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Loading */}
            {isLoading && (
              <View style={{ alignItems: "center", paddingVertical: 48 }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {/* Empty state */}
            {!isLoading && !debouncedQuery && (
              <View style={{ alignItems: "center", paddingVertical: 64, paddingHorizontal: 32 }}>
                <Text style={{ fontSize: 48, opacity: 0.2, marginBottom: 12 }}>🎵</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>Search for songs, artists, and albums</Text>
              </View>
            )}

            {/* No results */}
            {!isLoading && debouncedQuery && results.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 64, paddingHorizontal: 32 }}>
                <Feather name="search" size={48} color={colors.textMuted} style={{ opacity: 0.2, marginBottom: 12 }} />
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>No results for "{debouncedQuery}"</Text>
              </View>
            )}

            {/* Results */}
            {!isLoading && results.length > 0 && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
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
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
