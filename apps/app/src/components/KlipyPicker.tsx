import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  KLIPY_ENABLED,
  KLIPY_PAGE_SIZE,
  KLIPY_TABS,
  type KlipyMediaType,
  type MediaResult,
  searchKlipy,
} from "@/src/api/klipy";
import { Text } from "@/src/components/Text";
import { colors } from "@/src/theme";

/** Debounce a fast-changing value. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface KlipyPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (media: MediaResult) => void;
}

/** KLIPY-powered GIF / sticker / clip picker in a bottom sheet. */
export default function KlipyPicker({
  visible,
  onClose,
  onSelect,
}: KlipyPickerProps) {
  const [type, setType] = useState<KlipyMediaType>("gifs");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 350);

  const { data, isFetching, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["klipy", type, debounced],
    queryFn: ({ pageParam }) => searchKlipy(type, debounced, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === KLIPY_PAGE_SIZE ? pages.length + 1 : undefined,
    enabled: KLIPY_ENABLED && visible,
    staleTime: 60_000,
  });

  const results = data?.pages.flat() ?? [];
  const activeLabel = KLIPY_TABS.find((t) => t.type === type)?.label ?? "GIFs";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 16,
            paddingBottom: 24,
            height: "72%",
          }}
        >
          {/* Grab handle */}
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.surface3,
              }}
            />
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
            {KLIPY_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.type}
                onPress={() => setType(tab.type)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  backgroundColor:
                    type === tab.type ? colors.primary : colors.surface2,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: type === tab.type ? "#fff" : colors.textMuted,
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              style={{ justifyContent: "center" }}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.inputBackground,
              borderRadius: 8,
              paddingHorizontal: 10,
              marginBottom: 10,
            }}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={16}
              color={colors.textMuted}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${activeLabel}`}
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              style={{
                flex: 1,
                height: 38,
                color: colors.text,
                fontSize: 14,
              }}
            />
          </View>

          {!KLIPY_ENABLED ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                textAlign: "center",
                paddingVertical: 32,
              }}
            >
              GIF search is not configured
            </Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 6 }}
              contentContainerStyle={{ gap: 6, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (hasNextPage && !isFetching) fetchNextPage();
              }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: colors.surface2,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={{ uri: item.previewUrl ?? item.url }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    accessibilityLabel={item.alt}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                isFetching ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={{ paddingVertical: 32 }}
                  />
                ) : (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      textAlign: "center",
                      paddingVertical: 32,
                    }}
                  >
                    No results
                  </Text>
                )
              }
              ListFooterComponent={
                isFetching && results.length > 0 ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={{ paddingVertical: 12 }}
                  />
                ) : null
              }
            />
          )}

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 10,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Powered by KLIPY
          </Text>
        </View>
      </View>
    </Modal>
  );
}
