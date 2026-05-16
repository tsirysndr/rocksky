import { API_URL } from "@/src/consts";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";
import { useSetAtom } from "jotai";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/src/components/Text";
import { WebView } from "react-native-webview";
import { profileAtom } from "@/src/atoms/profile";
import { useCurrentUserProfile } from "@/src/hooks/useProfile";

type Props = {
  onSuccess: () => void;
};

export default function SignIn({ onSuccess }: Props) {
  const [handle, setHandle] = useState("");
  const [showWebView, setShowWebView] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSignIn = () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    const url = `https://rocksky.pages.dev/loading?handle=${encodeURIComponent(trimmed)}`;
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
        await storage.setToken(data.token);
        await storage.setDid(did);
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
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>Signing in...</Text>
      </View>
    );
  }

  if (showWebView) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, backgroundColor: colors.surface }}>
          <TouchableOpacity onPress={() => setShowWebView(false)}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: "center", color: colors.text, fontSize: 14, fontWeight: "600" }}>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 32 }}>
        {/* Logo / Title */}
        <Text style={{ fontSize: 36, fontWeight: "800", color: colors.primary, textAlign: "center", marginBottom: 8 }}>
          Rocksky
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: "center", marginBottom: 48 }}>
          Your music, your community
        </Text>

        {/* Handle input */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 6 }}>
          Handle
        </Text>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface2,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          marginBottom: 16,
          paddingHorizontal: 12,
        }}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>@</Text>
          <TextInput
            value={handle}
            onChangeText={setHandle}
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

        {error ? (
          <Text style={{ color: colors.primary, fontSize: 12, textAlign: "center", marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={onSignIn}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Sign In</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center" }}>
          Don't have an atproto handle yet?{"\n"}You can create one at{" "}
          <Text style={{ color: colors.primary, fontWeight: "600" }} onPress={onCreateAccount}>
            selfhosted.social
          </Text>
          ,{" "}
          <Text style={{ color: colors.primary, fontWeight: "600" }} onPress={() => Linking.openURL("https://bsky.app")}>
            Bluesky
          </Text>
          {" "}or any other AT Protocol service.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
