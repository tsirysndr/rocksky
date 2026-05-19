/* eslint-disable @typescript-eslint/no-explicit-any */
import { profileAtom } from "@/src/atoms/profile";
import { shoutsAtom } from "@/src/atoms/shouts";
import { Text } from "@/src/components/Text";
import useShout from "@/src/hooks/useShout";
import useLike from "@/src/hooks/useLike";
import Heart from "@/src/components/Icons/Heart";
import HeartOutline from "@/src/components/Icons/HeartOutline";
import { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
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

dayjs.extend(relativeTime);

type Props = { route?: RouteProp<RootStackParamList, "ShoutEditor"> };

function ShoutItem({ shout, onLike, onDelete, myDid }: {
  shout: any;
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
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {shout.user.avatar ? (
        <Image source={{ uri: shout.user.avatar }} style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0 }} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, flexShrink: 0 }} />
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{shout.user.displayName}</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{dayjs(shout.date).fromNow()}</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>{shout.message}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
          <TouchableOpacity onPress={handleLike} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {liked
              ? <Heart size={16} color={colors.primary} />
              : <HeartOutline size={16} color={colors.textMuted} />
            }
            {likes > 0 && <Text style={{ fontSize: 11, color: liked ? colors.primary : colors.textMuted }}>{likes}</Text>}
          </TouchableOpacity>
          {myDid === shout.user.did && (
            <TouchableOpacity onPress={() => Alert.alert("Delete shout?", "", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => onDelete(shout.uri) },
            ])}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
        {shout.replies?.length > 0 && (
          <View style={{ marginTop: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.border }}>
            {shout.replies.map((reply: any) => (
              <ShoutItem key={reply.id} shout={reply} onLike={onLike} onDelete={onDelete} myDid={myDid} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ShoutEditor({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { uri = "", type = "song", title } = route?.params || {};

  const profile = useAtomValue(profileAtom);
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const { shout: postShout, getShouts, deleteShout } = useShout();
  const { like: likeApi, unlike: unlikeApi } = useLike();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const processShouts = (data: any[]) => {
    const mapShouts = (parentId: string | null): any[] =>
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
          user: {
            did: x.users.did,
            avatar: x.users.avatar,
            displayName: x.users.displayName,
            handle: x.users.handle,
          },
          replies: mapShouts(x.shouts.id).reverse(),
        }));
    return mapShouts(null);
  };

  useEffect(() => {
    if (!uri) return;
    getShouts(uri).then((data) => {
      setShouts((prev) => ({ ...prev, [uri]: processShouts(data) }));
    });
  }, [uri]);

  const handleSubmit = async () => {
    if (!message.trim() || !uri || loading) return;
    setLoading(true);
    try {
      await postShout(uri, message);
      const data = await getShouts(uri);
      setShouts((prev) => ({ ...prev, [uri]: processShouts(data) }));
      setMessage("");
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.primary, fontSize: 15 }}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>Shoutbox</Text>
          {title && (
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
              {type} · {title}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Input */}
        {profile ? (
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{message.length}/1000</Text>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!message.trim() || loading}
                style={{
                  backgroundColor: message.trim() && !loading ? colors.primary : colors.surface2,
                  borderRadius: 20,
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={{ color: message.trim() ? "#fff" : colors.textMuted, fontWeight: "600", fontSize: 14 }}>
                    Post Shout
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sign in to leave a shout</Text>
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
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
              No shouts yet. Be the first!
            </Text>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
