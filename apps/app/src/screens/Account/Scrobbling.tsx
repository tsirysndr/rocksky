import Feather from "@expo/vector-icons/Feather";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  type ScrobbleSettings,
  type ScrobbleStatus,
  scrobbler,
} from "../../../modules/rocksky-scrobbler";
import { Text } from "../../components/Text";
import ThemedSwitch from "../../components/ThemedSwitch";
import { colors } from "../../theme";

const knownApps = [
  { packageName: "com.spotify.music", label: "Spotify" },
  { packageName: "com.aspiro.tidal", label: "Tidal" },
  { packageName: "deezer.android.app", label: "Deezer" },
  { packageName: "com.google.android.youtube", label: "YouTube" },
  { packageName: "fm.atradio.app", label: "atradio.fm" },
  {
    packageName: "com.google.android.apps.youtube.music",
    label: "YouTube Music",
  },
  { packageName: "com.apple.android.music", label: "Apple Music" },
  { packageName: "com.shazam.android", label: "Shazam / Auto Shazam" },
  { packageName: "com.google.android.as", label: "Pixel Now Playing (legacy)" },
  {
    packageName: "com.google.intelligence.sense",
    label: "Pixel Ambient Services",
  },
  {
    packageName: "com.kieronquinn.app.pixelambientmusic",
    label: "Ambient Music Mod",
  },
  { packageName: "com.mrsep.musicrecognizer", label: "Audile" },
];

export default function Scrobbling() {
  const [status, setStatus] = useState<ScrobbleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<string | null>(null);
  const [percent, setPercent] = useState<string | null>(null);
  const [minimum, setMinimum] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      if (!scrobbler || AppState.currentState !== "active") return;
      try {
        const next = await scrobbler.status();
        if (mounted) {
          setStatus(next);
          setError(null);
        }
      } catch (e) {
        if (mounted) setError(String(e));
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      if (scrobbler) setStatus(await scrobbler.status());
    } catch (e) {
      Alert.alert("Scrobbling", String(e));
    } finally {
      setBusy(false);
    }
  }
  const configure = (patch: Partial<ScrobbleSettings>) =>
    run(async () => {
      if (!status || !scrobbler) return;
      await scrobbler.configure(JSON.stringify({ ...status, ...patch }));
    });
  if (Platform.OS !== "android")
    return <Text>Scrobbling from other apps is available on Android.</Text>;
  if (!scrobbler)
    return (
      <Text>
        Install a native Rocksky build to use Android scrobbling. This feature
        is not available in Expo Go.
      </Text>
    );
  if (!status)
    return error ? (
      <Text>{error}</Text>
    ) : (
      <ActivityIndicator color={colors.primary} />
    );
  const apps = [
    ...new Map(
      [...knownApps, ...status.apps].map((app) => [app.packageName, app]),
    ).values(),
  ];
  const current = status.current
    ? (JSON.parse(status.current) as {
        title: string;
        artist: string;
        album: string;
        submitted: boolean;
        source: string;
      })
    : null;
  const numberFields = [
    {
      label:
        status.mode === "position"
          ? "Track position (seconds)"
          : "Maximum listening time (seconds)",
      value: seconds ?? String(status.seconds),
      change: setSeconds,
    },
    ...(status.mode === "listened"
      ? [
          {
            label: "Track percentage",
            value: percent ?? String(status.percent),
            change: setPercent,
          },
        ]
      : []),
    {
      label: "Minimum track length (seconds)",
      value: minimum ?? String(status.minimum),
      change: setMinimum,
    },
  ];
  return (
    <View style={{ gap: 18 }}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Scrobble other apps</Text>
            <Text style={styles.note}>
              Save the music you listen to on Rocksky.
            </Text>
          </View>
          <ThemedSwitch
            accessibilityLabel="Enable scrobbling"
            disabled={busy}
            value={status.enabled}
            onValueChange={(enabled) => void configure({ enabled })}
          />
        </View>
        <Text
          style={[
            styles.note,
            {
              color:
                status.enabled && status.notificationAccess && status.connected
                  ? "#52d6b0"
                  : colors.textMuted,
            },
          ]}
        >
          {!status.enabled
            ? "Scrobbling is off. Saved listens stay on this device."
            : !status.notificationAccess
              ? "Setup needed: allow notification access below."
              : !status.signedIn
                ? "Sign in to start scrobbling."
                : status.connected
                  ? "Listening in the background"
                  : "Waiting for Android to connect the listener"}
        </Text>
        <Text style={styles.note}>
          Reads music metadata from media sessions and supported recognition
          notifications. Title and artist are required; album is included when
          available.
        </Text>
        <TouchableOpacity
          style={styles.button}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              if (Number(Platform.Version) >= 33)
                await PermissionsAndroid.request(
                  PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                );
              await scrobbler?.openNotificationAccess();
            })
          }
        >
          <Text style={styles.buttonText}>
            {status.notificationAccess
              ? "Manage notification access"
              : "Allow notification access"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.link}
          onPress={() => void run(async () => scrobbler?.openBatterySettings())}
        >
          <Text style={{ color: colors.primary }}>
            Background & battery settings
          </Text>
          <Feather name="external-link" size={16} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.note}>
          For reliable screen-off listening, allow unrestricted battery usage.
          Android force-stop suspends detection until you reopen Rocksky.
        </Text>
      </View>

      {current && status.enabled && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>
            {current.submitted ? "LISTEN SAVED" : "DETECTED NOW"}
          </Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text>{current.artist}</Text>
          {!!current.album && <Text style={styles.note}>{current.album}</Text>}
          <Text style={styles.note}>
            {apps.find((app) => app.packageName === current.source)?.label ??
              current.source}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>When to scrobble</Text>
        <Text style={styles.note}>
          Default: after 50% or 4 minutes of listening, whichever comes first.
          Tracks shorter than 30 seconds are skipped. Pauses and seeks do not
          add listening time.
        </Text>
        <View style={styles.row}>
          {(["listened", "position"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: status.mode === mode }}
              disabled={busy}
              style={[
                styles.pill,
                status.mode === mode && { backgroundColor: colors.primary },
              ]}
              onPress={() => void configure({ mode })}
            >
              <Text>
                {mode === "listened" ? "Listening time" : "Track position"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {status.mode === "position" && (
          <Text style={styles.note}>
            Save when playback reaches this position, including after a seek.
            Tracks shorter than the selected position cannot qualify.
          </Text>
        )}
        {numberFields.map((field) => (
          <View key={field.label} style={styles.row}>
            <Text style={{ flex: 1 }}>{field.label}</Text>
            <TextInput
              accessibilityLabel={field.label}
              keyboardType="number-pad"
              style={styles.input}
              value={field.value}
              onChangeText={field.change}
              maxLength={4}
            />
          </View>
        ))}
        <TouchableOpacity
          disabled={busy}
          style={styles.button}
          onPress={() => {
            const values = {
              seconds: Number(seconds ?? status.seconds),
              percent: Number(percent ?? status.percent),
              minimum: Number(minimum ?? status.minimum),
            };
            if (
              !Object.values(values).every(Number.isInteger) ||
              values.seconds < 1 ||
              values.seconds > 3600 ||
              values.percent < 1 ||
              values.percent > 100 ||
              values.minimum < 0 ||
              values.minimum > 600
            ) {
              Alert.alert(
                "Check timing",
                "Use 1–3600 seconds, 1–100 percent, and a minimum track length of 0–600 seconds.",
              );
              return;
            }
            void configure(values).then(() => {
              setSeconds(null);
              setPercent(null);
              setMinimum(null);
            });
          }}
        >
          <Text style={styles.buttonText}>Save timing</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          style={styles.link}
          onPress={() =>
            void configure({
              mode: "listened",
              seconds: 240,
              percent: 50,
              minimum: 30,
            }).then(() => {
              setSeconds(null);
              setPercent(null);
              setMinimum(null);
            })
          }
        >
          <Text style={{ color: colors.primary }}>Restore default timing</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={[styles.title, { flex: 1 }]}>Music recognition</Text>
          <ThemedSwitch
            accessibilityLabel="Scrobble recognized music"
            disabled={busy}
            value={status.recognize}
            onValueChange={(recognize) => void configure({ recognize })}
          />
        </View>
        <Text style={styles.note}>
          Shazam and Audile results are saved immediately. Supported Now Playing
          notifications wait 15 seconds; repeated recognitions are suppressed
          for 5 minutes. These apps do not provide a playback position.
        </Text>
        <Text style={styles.note}>
          New Pixel Now Playing versions may hide recognition data. Album
          information is only available if the recognition app provides it.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Apps to scrobble</Text>
        <Text style={styles.note}>
          New media players are enabled automatically and appear here when
          detected. Switch any app off to stop collecting its listens. Rocksky’s
          own player, YouTube, and atradio.fm are excluded. YouTube Music is
          supported.
        </Text>
        {apps.map((app) => (
          <View key={app.packageName} style={styles.appRow}>
            <View style={{ flex: 1 }}>
              <Text>{app.label}</Text>
              <Text style={styles.package}>{app.packageName}</Text>
            </View>
            <ThemedSwitch
              accessibilityLabel={`Scrobble ${app.label}`}
              disabled={busy || !!status.excluded?.includes(app.packageName)}
              value={!status.blocked.includes(app.packageName)}
              onValueChange={(enabled) =>
                void configure({
                  blocked: enabled
                    ? status.blocked.filter((pkg) => pkg !== app.packageName)
                    : [...status.blocked, app.packageName],
                })
              }
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Offline queue</Text>
        <Text style={styles.note}>
          {status.queued} saved on this device
          {status.failed ? ` · ${status.failed} need retry` : ""}. Uploads
          resume automatically when connected and scrobbling is enabled, even
          with the app closed.
        </Text>
        {!!status.lastUpload && (
          <Text style={styles.note}>
            Last upload: {new Date(status.lastUpload).toLocaleString()}
          </Text>
        )}
        {!!(error || status.error) && (
          <Text style={styles.note}>{error || status.error}</Text>
        )}
        <TouchableOpacity
          disabled={busy || !status.enabled}
          style={styles.button}
          onPress={() => void run(async () => scrobbler?.retry())}
        >
          <Text style={styles.buttonText}>Retry saved listens</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          Saved listens remain tied to the account that collected them. Disable
          duplicate scrobbling integrations for the same player if needed.
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 18,
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  button: {
    backgroundColor: colors.primary,
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "white", fontWeight: "600" },
  link: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 12,
  },
  pill: { padding: 12, borderRadius: 24, backgroundColor: colors.surface2 },
  input: {
    color: colors.text,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 10,
    width: 80,
    textAlign: "center",
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  package: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
});
