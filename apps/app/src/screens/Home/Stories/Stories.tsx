import { type NavigationProp, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { useSetAtom } from "jotai";
import { FlatList, TouchableOpacity, View } from "react-native";
import { storiesAtom } from "@/src/atoms/stories";
import { Text } from "@/src/components/Text";
import { useStoriesQuery } from "@/src/hooks/useStories";
import type { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";

function StoriesSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ alignItems: "center", width: 72 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surface2,
              marginBottom: 4,
            }}
          />
          <View
            style={{
              width: 48,
              height: 9,
              borderRadius: 5,
              backgroundColor: colors.surface2,
            }}
          />
        </View>
      ))}
    </View>
  );
}

export default function Stories() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data: stories, isLoading } = useStoriesQuery();
  const setStories = useSetAtom(storiesAtom);

  if (isLoading) return <StoriesSkeleton />;
  if (!stories?.length) return null;

  const openStory = (index: number) => {
    setStories(stories);
    navigation.navigate("Story", { index });
  };

  return (
    <FlatList
      horizontal
      data={stories}
      keyExtractor={(item, i) =>
        `${item.trackId}-${item.did}-${item.createdAt}-${i}`
      }
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        gap: 16,
      }}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          onPress={() => openStory(index)}
          style={{ alignItems: "center", width: 72 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: 2,
              borderColor: colors.primary,
              padding: 2,
              marginBottom: 4,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 28,
                overflow: "hidden",
                backgroundColor: colors.avatarBackground,
              }}
            >
              {item.avatar && !item.avatar.endsWith("/@jpeg") ? (
                <Image
                  source={item.avatar}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : null}
            </View>
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              color: colors.textMuted,
              width: "100%",
              textAlign: "center",
            }}
          >
            {item.handle}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}
