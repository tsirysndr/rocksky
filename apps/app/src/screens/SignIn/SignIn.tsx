import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import {
  isValidHandle,
  normalizeHandle,
  resolveSignInHandle,
  searchHandleSuggestions,
} from "@/src/api/handleLookup";
import LoginStars from "@/src/components/LoginStars";
import LoginTour from "@/src/components/LoginTour";
import { Text } from "@/src/components/Text";
import UserAvatar from "@/src/components/UserAvatar";
import { API_URL } from "@/src/consts";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
};

export default function SignIn({ onSuccess, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const handleFieldY = useRef(0);
  const handleFocused = useRef(false);
  const revealHandle = () => {
    if (handleFocused.current) {
      scroll.current?.scrollTo({
        y: Math.max(0, handleFieldY.current - insets.top - 56),
        animated: false,
      });
    }
  };
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [handle, setHandle] = useState("");
  const [showWebView, setShowWebView] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const normalized = normalizeHandle(handle);
  const [debounced, setDebounced] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalized), 300);
    return () => clearTimeout(timer);
  }, [normalized]);
  const settled = normalized === debounced;
  const validFormat = isValidHandle(normalized);
  const resolution = useQuery({
    queryKey: ["signin", "resolve-handle", debounced],
    queryFn: ({ signal }) => resolveSignInHandle(debounced, signal),
    enabled: isValidHandle(debounced) && !showWebView && !loading,
    retry: false,
    staleTime: 0,
  });
  const suggestions = useQuery({
    queryKey: ["signin", "handle-suggestions", debounced],
    queryFn: ({ signal }) => searchHandleSuggestions(debounced, signal),
    enabled:
      debounced.length >= 2 && suggestionsOpen && !showWebView && !loading,
    retry: false,
    staleTime: 30000,
  });
  const checking =
    !!normalized && (!settled || (validFormat && resolution.isFetching));
  const verified =
    settled &&
    validFormat &&
    !resolution.isFetching &&
    !resolution.isError &&
    resolution.data?.handle === normalized &&
    !!resolution.data.did;
  const canSignIn = verified && !loading && !showWebView;
  const editHandle = (value: string) => {
    setHandle(value);
    setSuggestionsOpen(true);
    setError("");
  };

  const onSignIn = () => {
    if (!canSignIn) return;
    const trimmed = normalized;
    const url = `https://rocksky.pages.dev/loading?handle=${encodeURIComponent(trimmed)}`;
    setSuggestionsOpen(false);
    setAuthUrl(url);
    setShowWebView(true);
    setError("");
  };

  const onCreateAccount = () => {
    setAuthUrl("https://rocksky.pages.dev/loading?prompt=create");
    setShowWebView(true);
    setError("");
  };

  const handleNavigationChange = async (navState: { url: string }) => {
    const url = navState.url;
    const match = url.match(/[?&]did=([^&]+)/);
    if (!match) return;
    const did = decodeURIComponent(match[1]);
    if (!did || did === "null") return;

    setShowWebView(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/token`, {
        method: "GET",
        headers: { "session-did": did },
      });
      const data = await res.json();
      if (data.token) {
        await storage.setSession(data.token, did);
        onSuccess();
      } else {
        setError("Login failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>
          Signing in...
        </Text>
      </View>
    );
  }

  if (showWebView) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 60,
            paddingBottom: 12,
            backgroundColor: colors.surface,
          }}
        >
          <TouchableOpacity onPress={() => setShowWebView(false)}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text
            style={{
              flex: 1,
              textAlign: "center",
              color: colors.text,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Rocksky Login
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <WebView
          source={{ uri: authUrl }}
          onNavigationStateChange={handleNavigationChange}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LoginStars />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scroll}
          onContentSizeChange={() => {
            if (keyboardVisible) revealHandle();
          }}
          style={{ flex: 1 }}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: keyboardVisible ? "flex-start" : "center",
            paddingHorizontal: 32,
            paddingTop: insets.top + (keyboardVisible ? 16 : 48),
            paddingBottom: insets.bottom + 32,
          }}
        >
          {/* Logo / Title */}
          <Text
            style={{
              fontSize: 36,
              fontWeight: "800",
              color: colors.primary,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Rocksky
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: colors.textMuted,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Your music, your community
          </Text>

          {!keyboardVisible && <LoginTour />}

          {/* Android's adjustResize provides the keyboard viewport. Collapse the
              tour and anchor the form so suggestions remain scrollable above it. */}
          <View
            onLayout={(event) => {
              handleFieldY.current = event.nativeEvent.layout.y;
              if (keyboardVisible) revealHandle();
            }}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: colors.textMuted,
              marginBottom: 6,
            }}
          >
            Handle
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              marginBottom: 16,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>@</Text>
            <TextInput
              value={handle}
              onChangeText={editHandle}
              onFocus={() => {
                handleFocused.current = true;
                setSuggestionsOpen(true);
                if (keyboardVisible) revealHandle();
              }}
              onBlur={() => {
                handleFocused.current = false;
              }}
              autoComplete="username"
              textContentType="username"
              accessibilityLabel="ATProto handle"
              placeholder="username.bsky.social"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={onSignIn}
              style={{
                flex: 1,
                paddingVertical: 14,
                paddingLeft: 4,
                color: colors.text,
                fontSize: 14,
                fontFamily: "RockfordSansRegular",
              }}
            />
          </View>

          {!!normalized && (
            <View style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
              {checking ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Checking handle…
                  </Text>
                </View>
              ) : verified ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Feather
                    name="check-circle"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={{ color: colors.text, fontSize: 13 }}>
                    Account found
                  </Text>
                </View>
              ) : !validFormat ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  Enter a full handle, such as username.bsky.social, or choose a
                  suggestion.
                </Text>
              ) : resolution.isError ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => void resolution.refetch()}
                >
                  <Text style={{ color: colors.primary, fontSize: 13 }}>
                    Couldn’t check this handle. Check your connection and tap to
                    retry.
                  </Text>
                </TouchableOpacity>
              ) : resolution.data?.did === null ? (
                <Text style={{ color: colors.primary, fontSize: 13 }}>
                  No ATProto account found for this handle. Check the spelling.
                </Text>
              ) : null}
            </View>
          )}

          {suggestionsOpen && settled && normalized.length >= 2 && (
            <View style={{ marginBottom: 16 }}>
              {suggestions.isFetching && (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Finding accounts…
                </Text>
              )}
              {suggestions.data?.map((actor) => (
                <TouchableOpacity
                  key={actor.did}
                  accessibilityRole="button"
                  accessibilityLabel={`Use @${actor.handle}`}
                  onPress={() => {
                    setHandle(actor.handle);
                    setSuggestionsOpen(false);
                    setError("");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                  }}
                >
                  <UserAvatar uri={actor.avatar} size={40} />
                  <View style={{ flex: 1, gap: 3 }}>
                    {!!actor.displayName && (
                      <Text
                        numberOfLines={1}
                        style={{ fontWeight: "600", fontSize: 14 }}
                      >
                        {actor.displayName}
                      </Text>
                    )}
                    <Text
                      numberOfLines={2}
                      style={{ color: colors.textMuted, fontSize: 12 }}
                    >
                      @{actor.handle}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {suggestions.isError && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => void suggestions.refetch()}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Suggestions unavailable. Tap to retry, or enter your full
                    handle.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {error ? (
            <Text
              style={{
                color: colors.primary,
                fontSize: 12,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={onSignIn}
            disabled={!canSignIn}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSignIn }}
            style={{
              opacity: canSignIn ? 1 : 0.4,
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
              Sign In
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 12,
              color: colors.textMuted,
              textAlign: "center",
            }}
          >
            Don't have an atproto handle yet?{"\n"}You can create one at{" "}
            <Text
              style={{ color: colors.primary, fontWeight: "600" }}
              onPress={onCreateAccount}
            >
              rocksky.social
            </Text>
            ,{" "}
            <Text
              style={{ color: colors.primary, fontWeight: "600" }}
              onPress={() => Linking.openURL("https://bsky.app")}
            >
              Bluesky
            </Text>{" "}
            or any other AT Protocol service.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Close sign in"
        onPress={onCancel}
        style={{
          position: "absolute",
          top: insets.top + 8,
          right: 16,
          padding: 12,
        }}
      >
        <Feather name="x" size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}
