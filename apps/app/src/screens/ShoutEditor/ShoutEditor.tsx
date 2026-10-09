import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GifEmbed, MediaResult } from "@/src/api/klipy";
import { isVideoUrl } from "@/src/api/klipy";
import type { Shout, ShoutRow } from "@/src/api/shouts";
import { profileAtom } from "@/src/atoms/profile";
import { shoutsAtom } from "@/src/atoms/shouts";
import Heart from "@/src/components/Icons/Heart";
import HeartOutline from "@/src/components/Icons/HeartOutline";
import KlipyPicker from "@/src/components/KlipyPicker";
import { Text } from "@/src/components/Text";
import useLike from "@/src/hooks/useLike";
import useShout from "@/src/hooks/useShout";
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";

dayjs.extend(relativeTime);

type Props = { route?: RouteProp<RootStackParamList, "ShoutEditor"> };

function processShouts(data: ShoutRow[]): Shout[] {
  const mapShouts = (parentId: string | null): Shout[] =>
    data
      .filter((x) => x.shouts.parent === parentId)
      .map((x) => ({
        id: x.shouts.id,
        uri: x.shouts.uri,
        message: x.shouts.content,
        date: x.shouts.createdAt,
        liked: x.shouts.liked,
        reported: x.shouts.reported,
        likes: x.shouts.likes,
        gif: x.shouts.gifUrl
          ? {
              url: x.shouts.gifUrl,
              previewUrl: x.shouts.gifPreviewUrl ?? undefined,
              alt: x.shouts.gifAlt ?? undefined,
              width: x.shouts.gifWidth ?? undefined,
              height: x.shouts.gifHeight ?? undefined,
            }
          : undefined,
        user: {
          did: x.users.did,
          avatar: x.users.avatar,
          displayName: x.users.displayName,
          handle: x.users.handle,
        },
        replies: mapShouts(x.shouts.id).reverse(),
      }));
  return mapShouts(null);
}

const gifMediaStyle = (aspectRatio: number) =>
  ({
    width: 260,
    maxWidth: "100%",
    aspectRatio,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surface2,
  }) as const;

function GifVideo({ url, aspectRatio }: { url: string; aspectRatio: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={gifMediaStyle(aspectRatio)}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function GifMedia({ gif }: { gif: GifEmbed }) {
  const aspectRatio = gif.width && gif.height ? gif.width / gif.height : 1;
  if (isVideoUrl(gif.url)) {
    return <GifVideo url={gif.url} aspectRatio={aspectRatio} />;
  }
  return (
    <ExpoImage
      source={{ uri: gif.previewUrl ?? gif.url }}
      accessibilityLabel={gif.alt}
      style={gifMediaStyle(aspectRatio)}
      contentFit="cover"
    />
  );
}

function ShoutItem({
  shout,
  onLike,
  onDelete,
  myDid,
}: {
  shout: Shout;
  onLike: (uri: string, liked: boolean) => void;
  onDelete: (uri: string) => void;
  myDid: string | null;
}) {
  const [liked, setLiked] = useState(shout.liked);
  const [likes, setLikes] = useState(shout.likes);

  const handleLike = () => {
    if (!storage.getToken()) return;
    if (liked) {
      setLiked(false);
      setLikes((c: number) => Math.max(0, c - 1));
    } else {
      setLiked(true);
      setLikes((c: number) => c + 1);
    }
    onLike(shout.uri, !liked);
  };

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {shout.user.avatar ? (
        <Image
          source={{ uri: shout.user.avatar }}
          style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0 }}
        />
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surface2,
            flexShrink: 0,
          }}
        />
      )}
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
            {shout.user.displayName}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            {dayjs(shout.date).fromNow()}
          </Text>
        </View>
        {shout.message ? (
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>
            {shout.message}
          </Text>
        ) : null}
        {shout.gif && (
          <View style={{ marginTop: 6 }}>
            <GifMedia gif={shout.gif} />
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 6,
          }}
        >
          <TouchableOpacity
            onPress={handleLike}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            {liked ? (
              <Heart size={16} color={colors.primary} />
            ) : (
              <HeartOutline size={16} color={colors.textMuted} />
            )}
            {likes > 0 && (
              <Text
                style={{
                  fontSize: 11,
                  color: liked ? colors.primary : colors.textMuted,
                }}
              >
                {likes}
              </Text>
            )}
          </TouchableOpacity>
          {myDid === shout.user.did && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Delete shout?", "", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => onDelete(shout.uri),
                  },
                ])
              }
            >
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                Delete
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {(shout.replies?.length ?? 0) > 0 && (
          <View
            style={{
              marginTop: 8,
              paddingLeft: 12,
              borderLeftWidth: 2,
              borderLeftColor: colors.border,
            }}
          >
            {shout.replies?.map((reply) => (
              <ShoutItem
                key={reply.id}
                shout={reply}
                onLike={onLike}
                onDelete={onDelete}
                myDid={myDid}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ShoutEditor({ route }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { uri = "", type = "song", title, picture } = route?.params || {};

  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  const roundPicture = type === "artist" || type === "profile";

  const profile = useAtomValue(profileAtom);
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const { shout: postShout, getShouts, deleteShout } = useShout();
  const { like: likeApi, unlike: unlikeApi } = useLike();
  const [message, setMessage] = useState("");
  const [gif, setGif] = useState<MediaResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!uri) return;
    getShouts(uri).then((data) => {
      setShouts((prev) => ({ ...prev, [uri]: processShouts(data) }));
    });
  }, [uri, getShouts, setShouts]);

  const canPost = Boolean(message.trim() || gif);

  const handleSubmit = async () => {
    if (!canPost || !uri || loading) return;
    setLoading(true);
    try {
      const gifEmbed: GifEmbed | undefined = gif
        ? {
            url: gif.url,
            previewUrl: gif.previewUrl,
            alt: gif.alt,
            width: gif.width,
            height: gif.height,
          }
        : undefined;
      await postShout(uri, message, gifEmbed);
      const data = await getShouts(uri);
      setShouts((prev) => ({ ...prev, [uri]: processShouts(data) }));
      setMessage("");
      setGif(null);
      inputRef.current?.blur();
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (shoutUri: string, toLike: boolean) => {
    if (toLike) await likeApi(shoutUri);
    else await unlikeApi(shoutUri);
  };

  const handleDelete = async (shoutUri: string) => {
    await deleteShout(shoutUri);
    const data = await getShouts(uri);
    setShouts((prev) => ({ ...prev, [uri]: processShouts(data) }));
  };

  const currentShouts = shouts[uri] || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.primary, fontSize: 15 }}>← Back</Text>
        </TouchableOpacity>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: roundPicture ? 20 : 6,
            overflow: "hidden",
            backgroundColor: colors.surface2,
            alignItems: "center",
            justifyContent: "center",
          }}
          accessible
          accessibilityLabel={`${title || type} ${roundPicture ? "picture" : "album art"}`}
        >
          {picture && failedPicture !== picture ? (
            <ExpoImage
              source={{ uri: picture }}
              style={{ width: 40, height: 40 }}
              contentFit="cover"
              recyclingKey={picture}
              onError={() => setFailedPicture(picture)}
            />
          ) : (
            <MaterialCommunityIcons
              name={roundPicture ? "account" : "music"}
              size={22}
              color={colors.textMuted}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>
            Shoutbox
          </Text>
          {title && (
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, color: colors.textMuted }}
            >
              {type} · {title}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Input */}
        {profile ? (
          <View
            style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            {gif && (
              <View style={{ alignSelf: "flex-start", marginBottom: 10 }}>
                <ExpoImage
                  source={{ uri: gif.previewUrl ?? gif.url }}
                  accessibilityLabel={gif.alt}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 8,
                    backgroundColor: colors.surface2,
                  }}
                  contentFit="cover"
                />
                <TouchableOpacity
                  onPress={() => setGif(null)}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    backgroundColor: colors.surface3,
                    borderRadius: 11,
                    padding: 3,
                  }}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={14}
                    color={colors.text}
                  />
                </TouchableOpacity>
              </View>
            )}
            <TextInput
              ref={inputRef}
              value={message}
              onChangeText={setMessage}
              placeholder={`@${profile.handle}, share your thoughts...`}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
              style={{
                backgroundColor: colors.surface2,
                color: colors.text,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                minHeight: 72,
                textAlignVertical: "top",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <TouchableOpacity
                  onPress={() => setPickerOpen(true)}
                  hitSlop={8}
                  accessibilityLabel="Add a GIF"
                >
                  <MaterialCommunityIcons
                    name="file-gif-box"
                    size={26}
                    color={gif ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {message.length}/1000
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canPost || loading}
                style={{
                  backgroundColor:
                    canPost && !loading ? colors.primary : colors.surface2,
                  borderRadius: 20,
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text
                    style={{
                      color: canPost ? "#fff" : colors.textMuted,
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    Post Shout
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              Sign in to leave a shout
            </Text>
          </View>
        )}

        {/* Shout list */}
        <FlatList
          data={currentShouts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <ShoutItem
              shout={item}
              onLike={handleLike}
              onDelete={handleDelete}
              myDid={storage.getDid()}
            />
          )}
          ListEmptyComponent={
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                textAlign: "center",
                paddingVertical: 32,
              }}
            >
              No shouts yet. Be the first!
            </Text>
          }
        />
      </KeyboardAvoidingView>

      <KlipyPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(media) => setGif(media)}
      />
    </SafeAreaView>
  );
}
