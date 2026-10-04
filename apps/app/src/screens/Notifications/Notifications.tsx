import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { type NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  TouchableOpacity,
  View,
} from "react-native";
import {
  groupNotifications,
  type NotificationActor,
  type NotificationGroup,
  type NotificationType,
} from "@/src/api/notifications";
import { Text } from "@/src/components/Text";
import {
  useMarkSeenMutation,
  useNotificationsQuery,
} from "@/src/hooks/useNotifications";
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";

const VERBS: Record<string, string> = {
  like_scrobble: "liked your scrobble",
  follow: "followed you",
  comment_scrobble: "commented on your scrobble",
  comment_profile: "commented on your profile",
  reply: "replied to your comment",
  react_comment: "reacted to your comment",
  mention: "mentioned you",
};

function verbFor(type: NotificationType): string {
  return VERBS[type] || "sent you a notification";
}

function timeAgo(createdAt: string): string {
  const date = new Date(createdAt);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}d`;
  return date.toLocaleDateString();
}

function actorName(actor?: NotificationActor): string {
  return actor?.displayName || actor?.handle || "Someone";
}

function Avatar({
  actor,
  index,
}: {
  actor?: NotificationActor;
  index: number;
}) {
  const avatar = actor?.avatar;
  const showImage = !!avatar && !avatar.endsWith("/@jpeg");
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        marginLeft: index > 0 ? -10 : 0,
        borderWidth: 2,
        borderColor: colors.background,
        overflow: "hidden",
        backgroundColor: colors.avatarBackground,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: avatar }}
          style={{ width: 28, height: 28, borderRadius: 14 }}
        />
      ) : (
        <MaterialIcons name="account" size={18} color="#fff" />
      )}
    </View>
  );
}

function groupText(group: NotificationGroup) {
  const names = group.actors.map(actorName);
  const verb = verbFor(group.type);
  if (names.length <= 1) {
    return (
      <>
        <Text style={{ fontFamily: "RockfordSansMedium", color: colors.text }}>
          {names[0] || "Someone"}
        </Text>{" "}
        {verb}
      </>
    );
  }
  if (names.length === 2) {
    return (
      <>
        <Text style={{ fontFamily: "RockfordSansMedium", color: colors.text }}>
          {names[0]}
        </Text>
        {" and "}
        <Text style={{ fontFamily: "RockfordSansMedium", color: colors.text }}>
          {names[1]}
        </Text>{" "}
        {verb}
      </>
    );
  }
  const others = names.length - 2;
  return (
    <>
      <Text style={{ fontFamily: "RockfordSansMedium", color: colors.text }}>
        {names[0]}
      </Text>
      {", "}
      <Text style={{ fontFamily: "RockfordSansMedium", color: colors.text }}>
        {names[1]}
      </Text>
      {` and ${others} other${others > 1 ? "s" : ""} ${verb}`}
    </>
  );
}

const SUBJECT_URI_RE =
  /^at:\/\/([^/]+)\/app\.rocksky\.(scrobble|song|album|artist)\/([^/]+)$/;

function NotificationRow({
  group,
  unread,
  onPress,
}: {
  group: NotificationGroup;
  unread: boolean;
  onPress: (group: NotificationGroup) => void;
}) {
  const subject = group.latest.subject;
  const shoutContent = group.latest.shoutContent;
  return (
    <TouchableOpacity
      onPress={() => onPress(group)}
      style={{
        flexDirection: "row",
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
        backgroundColor: unread ? colors.surface : "transparent",
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {group.actors.slice(0, 3).map((actor, i) => (
          <Avatar
            key={actor.did ?? actor.id ?? actor.handle ?? i}
            actor={actor}
            index={i}
          />
        ))}
        {group.actors.length === 0 && <Avatar index={0} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 19 }}>
          {groupText(group)}
        </Text>
        {!!shoutContent && (
          <Text
            numberOfLines={2}
            style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18 }}
          >
            : "{shoutContent}"
          </Text>
        )}
        {!!subject && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: colors.surface2,
              borderRadius: 8,
              padding: 8,
              marginTop: 4,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                overflow: "hidden",
                backgroundColor: colors.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {subject.albumArt ? (
                <Image
                  source={{ uri: subject.albumArt }}
                  style={{ width: 44, height: 44 }}
                />
              ) : (
                <Text style={{ opacity: 0.2, fontSize: 18 }}>♪</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "600", color: colors.text }}
              >
                {subject.title}
              </Text>
              {!!subject.artist && (
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 12, color: colors.textMuted }}
                >
                  {subject.artist}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
        {timeAgo(group.latest.createdAt)}
      </Text>
    </TouchableOpacity>
  );
}

function SkeletonRows() {
  return (
    <View>
      {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"].map((id) => (
        <View
          key={id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            paddingHorizontal: 16,
            gap: 12,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.skeletonBackground,
            }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                height: 12,
                borderRadius: 6,
                backgroundColor: colors.skeletonBackground,
                width: "70%",
              }}
            />
            <View
              style={{
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.skeletonForeground,
                width: "40%",
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function CenteredMessage({ message }: { message: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <Text
        style={{ fontSize: 14, color: colors.textMuted, textAlign: "center" }}
      >
        {message}
      </Text>
    </View>
  );
}

export default function Notifications() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const token = storage.getToken();

  const { data, isLoading, refetch, isRefetching } = useNotificationsQuery();
  const markSeen = useMarkSeenMutation();

  const markedRef = useRef(false);
  useEffect(() => {
    if (token && !markedRef.current) {
      markedRef.current = true;
      markSeen.mutate(undefined);
    }
  }, [token, markSeen.mutate]);

  const unreadIdsRef = useRef<Set<string> | null>(null);
  if (data && unreadIdsRef.current === null) {
    unreadIdsRef.current = new Set(
      data.notifications.filter((n) => !n.read).map((n) => n.id),
    );
  }

  const groups = useMemo(
    () => groupNotifications(data?.notifications ?? []),
    [data],
  );

  const onPressGroup = (group: NotificationGroup) => {
    const subjectUri = group.latest.subjectUri;
    const match = subjectUri ? SUBJECT_URI_RE.exec(subjectUri) : null;
    if (match && subjectUri) {
      const collection = match[2];
      if (collection === "scrobble" || collection === "song") {
        navigation.navigate("SongDetails", { uri: subjectUri });
        return;
      }
      if (collection === "album") {
        navigation.navigate("AlbumDetails", { uri: subjectUri });
        return;
      }
      navigation.navigate("ArtistDetails", { uri: subjectUri });
      return;
    }
    const actor = group.latest.actor;
    const did = actor?.did || actor?.handle;
    if (did) {
      navigation.navigate("UserProfile", { did });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>
          Notifications
        </Text>
      </View>

      {!token ? (
        <CenteredMessage message="Sign in to see your notifications." />
      ) : isLoading ? (
        <SkeletonRows />
      ) : groups.length === 0 ? (
        <CenteredMessage message="No notifications yet." />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <NotificationRow
              group={item}
              unread={!!unreadIdsRef.current?.has(item.latest.id)}
              onPress={onPressGroup}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
