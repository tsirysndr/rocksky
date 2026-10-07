import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import { useAtomValue } from "jotai";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authTokenAtom } from "../../atoms/auth";
import { Text } from "../../components/Text";
import {
  clearCompletedUploads,
  enqueueUploads,
  retryUpload,
  uploadJobsAtom,
} from "../../lib/uploadQueue";
import { storage } from "../../storage";
import { colors } from "../../theme";
export default function Upload() {
  const navigation = useNavigation();
  const token = useAtomValue(authTokenAtom);
  const allJobs = useAtomValue(uploadJobsAtom);
  const jobs = allJobs.filter((job) => job.owner === storage.getDid());
  const ongoing = jobs.filter((job) =>
    ["queued", "preparing", "uploading", "processing"].includes(job.status),
  ).length;
  const [picking, setPicking] = useState(false);
  const pick = async () => {
    if (picking || !token) return;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled)
        enqueueUploads(
          result.assets.map((file) => ({
            uri: file.uri,
            name: file.name,
            mimeType: file.mimeType ?? "application/octet-stream",
          })),
        );
    } catch {
      Alert.alert("Could not choose files", "Please try again.");
    } finally {
      setPicking(false);
    }
  };
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Upload music</Text>
      </View>
      {!token ? (
        <Text style={styles.description}>Sign in to upload music.</Text>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          ListHeaderComponent={
            <>
              <Text style={styles.description}>
                Bring your music into your library. Files are private — only you
                can see and play them.
              </Text>
              <View style={styles.card}>
                <Text style={styles.heading}>Check your metadata</Text>
                <Text style={styles.description}>
                  Before uploading, make sure each file has the correct title,
                  artist, album, album artist, duration, and album art. Accurate
                  tags keep your library organized and your scrobbles matched to
                  the right music.
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    void Linking.openURL("https://picard.musicbrainz.org")
                  }
                >
                  <Text style={styles.link}>
                    Tag your files with MusicBrainz Picard ↗
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.card}>
                <Text style={styles.heading}>Stream it anywhere</Text>
                <Text style={styles.description}>
                  Play your uploads in Rocksky or through a Navidrome or
                  Subsonic-compatible client.
                </Text>
              </View>
              <TouchableOpacity
                disabled={picking}
                onPress={() => void pick()}
                style={styles.button}
              >
                <Feather name="upload" size={20} color={colors.text} />
                <Text style={styles.buttonText}>
                  {picking ? "Opening files…" : "Choose audio files"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.description}>
                MP3, FLAC, M4A, OGG, WAV, AIFF. You can select multiple files
                and add more while uploads are running.
              </Text>
              <View style={styles.header}>
                <Text style={styles.heading}>
                  Uploads{ongoing ? ` · ${ongoing} ongoing` : ""}
                </Text>
                {jobs.some(
                  (job) => job.status === "done" || job.status === "skipped",
                ) && (
                  <TouchableOpacity onPress={clearCompletedUploads}>
                    <Text style={styles.link}>Clear completed</Text>
                  </TouchableOpacity>
                )}
              </View>
              {ongoing > 0 && (
                <Text style={styles.description}>
                  You can browse other screens while uploads continue. Keep the
                  app open until they finish.
                </Text>
              )}
            </>
          }
          ListEmptyComponent={
            <Text style={styles.description}>
              No uploads yet. Choose files to get started.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Feather
                  name={
                    item.status === "done"
                      ? "check-circle"
                      : item.status === "skipped"
                        ? "skip-forward"
                        : item.status === "error"
                          ? "alert-circle"
                          : "music"
                  }
                  size={22}
                  color={item.status === "error" ? colors.primary : colors.text}
                />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{item.file.name}</Text>
                  <Text style={styles.description}>
                    {item.status === "queued"
                      ? "Queued"
                      : item.status === "preparing"
                        ? "Preparing audio and metadata…"
                        : item.status === "uploading"
                          ? `Uploading · ${item.progress}%`
                          : item.status === "processing"
                            ? "Processing metadata…"
                            : item.status === "done"
                              ? (item.title ?? "Uploaded")
                              : item.status === "skipped"
                                ? `Skipped · ${item.error}`
                                : `Upload failed · ${item.error ?? "Unknown error"}`}
                  </Text>
                  {!!item.missingFields?.length && (
                    <Text style={styles.description}>
                      Missing or invalid fields: {item.missingFields.join(", ")}
                    </Text>
                  )}
                  {!!item.hint && (
                    <Text style={styles.description}>{item.hint}</Text>
                  )}
                </View>
                {item.status === "error" && item.retryable && (
                  <TouchableOpacity onPress={() => retryUpload(item.id)}>
                    <Text style={styles.link}>Retry</Text>
                  </TouchableOpacity>
                )}
                {item.status === "processing" && (
                  <ActivityIndicator color={colors.primary} />
                )}
              </View>
              {item.status === "uploading" && (
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: item.progress }}
                  style={styles.progress}
                >
                  <View
                    style={{
                      width: `${item.progress}%`,
                      backgroundColor: colors.primary,
                      height: 4,
                    }}
                  />
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  heading: { fontSize: 16, fontWeight: "700" },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 21,
    marginVertical: 8,
  },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  link: { color: colors.primary, fontSize: 13 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: { color: colors.text, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  progress: {
    height: 4,
    backgroundColor: colors.surface3,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 8,
  },
});
