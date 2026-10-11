import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Text } from "../../components/Text";
import { playAudioUrl } from "../../lib/uploadEngine";
import { colors } from "../../theme";

export default function OpenAudioUrl() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (mode: "now" | "next" | "last") => {
    if (busy || !url.trim()) return;
    setBusy(true);
    setError("");
    try {
      await playAudioUrl(url.trim(), mode);
      setOpen(false);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audio URL");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open audio URL"
        onPress={() => setOpen(true)}
        style={{
          width: 44,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="link" size={22} color={colors.text} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "rgba(0,0,0,0.7)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 18,
              padding: 20,
              gap: 16,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}
            >
              Open audio URL
            </Text>
            <TextInput
              accessibilityLabel="Audio URL"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://example.com/track.mp3"
              placeholderTextColor={colors.textMuted}
              editable={!busy}
              style={{
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderRadius: 10,
                padding: 12,
              }}
            />
            {busy && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textMuted }}>
                  Checking audio and reading tags…
                </Text>
              </View>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: "#ff819f" }}>
                {error}
              </Text>
            )}
            {(
              [
                ["now", "Play now"],
                ["next", "Play next"],
                ["last", "Add to queue"],
              ] as const
            ).map(([mode, label]) => (
              <Pressable
                key={mode}
                accessibilityRole="button"
                disabled={busy || !url.trim()}
                onPress={() => void submit(mode)}
                style={{
                  padding: 12,
                  borderRadius: 24,
                  alignItems: "center",
                  backgroundColor: colors.primary,
                  opacity: busy || !url.trim() ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setOpen(false)}
              style={{ padding: 10, alignItems: "center" }}
            >
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
