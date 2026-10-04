import Feather from "@expo/vector-icons/Feather";
import { type RouteProp, useNavigation } from "@react-navigation/native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ThemedSwitch from "@/src/components/ThemedSwitch";
import * as api from "../../api/account";
import { authTokenAtom } from "../../atoms/auth";
import { PickerSheet } from "../../components/PlaylistSheets";
import { Text } from "../../components/Text";
import type { RootStackParamList } from "../../Navigation";
import { storage } from "../../storage";
import { colors } from "../../theme";
export type AccountSection =
  | "API Keys"
  | "Access tokens"
  | "Mirror sources"
  | "Storage"
  | "Wrapped";
function Button({
  children,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.45 }]}
    >
      <Text style={{ color: "#fff", fontWeight: "600" }}>{children}</Text>
    </TouchableOpacity>
  );
}
function Field({
  label,
  value,
  onChange,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
}) {
  return (
    <View>
      <Text style={styles.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}
function ErrorState({ retry }: { retry: () => void }) {
  return (
    <View style={styles.card}>
      <Text>Could not load this page.</Text>
      <Button onPress={retry}>Retry</Button>
    </View>
  );
}
function report(error: Error) {
  Alert.alert("Could not save changes", error.message);
}
function confirmDelete(label: string, action: () => void) {
  Alert.alert(`Delete ${label}?`, "This cannot be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: action },
  ]);
}
function Secret({ label, value }: { label: string; value: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TouchableOpacity onPress={() => setVisible(!visible)} style={styles.row}>
        <Text style={styles.muted}>{label}</Text>
        <Feather
          name={visible ? "eye-off" : "eye"}
          color={colors.textMuted}
          size={18}
        />
      </TouchableOpacity>
      <Text selectable style={styles.secret}>
        {visible ? value : "••••••••••••••••"}
      </Text>
    </View>
  );
}
function Credentials({ kind }: { kind: "keys" | "tokens" }) {
  const client = useQueryClient();
  const key = ["account", storage.getDid(), kind];
  const keys = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<(api.ApiKey | api.AccessToken)[]> =>
      kind === "keys"
        ? api.getApiKeys(pageParam)
        : api.getAccessTokens(pageParam),
    getNextPageParam: (page, pages) =>
      page.length === 50 ? pages.length * 50 : undefined,
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: (): Promise<api.ApiKey | api.AccessToken> =>
      kind === "keys"
        ? api.createApiKey(name.trim(), description.trim())
        : api.createAccessToken(name.trim()),
    onSuccess: (result) => {
      setCreating(false);
      setName("");
      setDescription("");
      if ("token" in result && result.token) setNewToken(result.token);
      void refresh();
    },
    onError: report,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      kind === "keys" ? api.deleteApiKey(id) : api.deleteAccessToken(id),
    onSuccess: refresh,
    onError: report,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.updateApiKey(id, enabled),
    onSuccess: refresh,
    onError: report,
  });
  return (
    <>
      <Text style={styles.muted}>
        {kind === "keys"
          ? "Connect scrobbling clients using an API key and shared secret."
          : "Create a named access token for a client or integration. Delete it to revoke access."}
      </Text>
      <Button onPress={() => setCreating(true)}>
        Create {kind === "keys" ? "API key" : "access token"}
      </Button>
      {keys.isLoading && <ActivityIndicator color={colors.primary} />}
      {keys.isError && <ErrorState retry={() => void keys.refetch()} />}
      {keys.data?.pages.flat().map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.title}>{item.name}</Text>
            <TouchableOpacity
              accessibilityLabel={`Delete ${item.name}`}
              disabled={remove.isPending}
              onPress={() =>
                confirmDelete(item.name, () => remove.mutate(item.id))
              }
            >
              <Feather name="trash-2" color={colors.textMuted} size={20} />
            </TouchableOpacity>
          </View>
          {"apiKey" in item ? (
            <>
              <Text style={styles.muted}>{item.description}</Text>
              <View style={styles.row}>
                <Text>Enabled</Text>
                <ThemedSwitch
                  accessibilityLabel={`Enable ${item.name}`}
                  value={item.enabled}
                  disabled={toggle.isPending}
                  onValueChange={(enabled) =>
                    toggle.mutate({ id: item.id, enabled })
                  }
                />
              </View>
              <Secret label="API key" value={item.apiKey} />
              <Secret label="Shared secret" value={item.sharedSecret} />
            </>
          ) : (
            <>
              <Text style={styles.muted}>Ends in {item.lastFour}</Text>
              <Text style={styles.muted}>
                {item.lastUsedAt
                  ? `Last used ${new Date(item.lastUsedAt).toLocaleDateString()}`
                  : "Not used yet"}
              </Text>
            </>
          )}
        </View>
      ))}
      {!keys.isLoading &&
        !keys.isError &&
        keys.data?.pages.flat().length === 0 && (
          <Text style={styles.muted}>None yet.</Text>
        )}
      {keys.hasNextPage && (
        <Button
          disabled={keys.isFetchingNextPage}
          onPress={() => void keys.fetchNextPage()}
        >
          Load more
        </Button>
      )}
      {creating && (
        <PickerSheet
          title={kind === "keys" ? "New API key" : "New access token"}
          onClose={() => {
            if (!create.isPending) setCreating(false);
          }}
        >
          <Field label="Name" value={name} onChange={setName} />
          {kind === "keys" && (
            <Field
              label="Description (optional)"
              value={description}
              onChange={setDescription}
            />
          )}
          <Button
            disabled={!name.trim() || create.isPending}
            onPress={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </PickerSheet>
      )}
      {newToken && (
        <PickerSheet
          title="Access token created"
          onClose={() => setNewToken(null)}
        >
          <Text style={styles.muted}>
            Save this token now. It is only shown once. Long-press to copy.
          </Text>
          <Text selectable style={styles.secret}>
            {newToken}
          </Text>
          <Button onPress={() => setNewToken(null)}>Done</Button>
        </PickerSheet>
      )}
    </>
  );
}
function MirrorCard({ source }: { source: api.MirrorSource }) {
  const client = useQueryClient();
  const [username, setUsername] = useState(source.externalUsername ?? "");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(source.enabled);
  const labels = {
    lastfm: "Last.fm",
    listenbrainz: "ListenBrainz",
    tealfm: "Teal.fm",
  };
  const needsCredentials = source.provider !== "tealfm";
  const save = useMutation({
    mutationFn: () =>
      api.putMirrorSource({
        provider: source.provider,
        enabled,
        ...(needsCredentials
          ? {
              externalUsername: username.trim(),
              ...(secret.trim() ? { apiKey: secret.trim() } : {}),
            }
          : {}),
      }),
    onSuccess: () => {
      setSecret("");
      void client.invalidateQueries({
        queryKey: ["account", storage.getDid(), "mirrors"],
      });
    },
    onError: report,
  });
  const valid =
    !enabled ||
    !needsCredentials ||
    (!!username.trim() && (!!secret.trim() || source.hasCredentials));
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{labels[source.provider]}</Text>
        <ThemedSwitch
          accessibilityLabel={`Enable ${labels[source.provider]}`}
          value={enabled}
          onValueChange={setEnabled}
        />
      </View>
      <Text style={styles.muted}>
        {needsCredentials
          ? "Import recent listens from this account."
          : "Mirror Teal.fm play events for your AT Protocol account."}
      </Text>
      {needsCredentials && (
        <>
          <Field label="Username" value={username} onChange={setUsername} />
          <Field
            secure
            label={
              source.provider === "lastfm"
                ? "Last.fm API key"
                : "ListenBrainz user token"
            }
            value={secret}
            onChange={setSecret}
          />
          {source.hasCredentials && (
            <Text style={styles.muted}>
              Credentials saved. Leave the key blank to keep them.
            </Text>
          )}
        </>
      )}
      <Button disabled={!valid || save.isPending} onPress={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
      {save.isSuccess && <Text style={styles.muted}>Saved</Text>}
    </View>
  );
}
function Mirrors() {
  const query = useQuery({
    queryKey: ["account", storage.getDid(), "mirrors"],
    queryFn: api.getMirrorSources,
  });
  if (query.isLoading) return <ActivityIndicator color={colors.primary} />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  return (
    <>
      {(["lastfm", "listenbrainz", "tealfm"] as const).map((provider) => {
        const source = query.data?.find((s) => s.provider === provider) ?? {
          provider,
          enabled: false,
          hasCredentials: false,
        };
        return (
          <MirrorCard
            key={`${provider}-${source.enabled}-${source.externalUsername}-${source.hasCredentials}`}
            source={source}
          />
        );
      })}
    </>
  );
}
function Storage() {
  const client = useQueryClient();
  const key = ["account", storage.getDid(), "storage"];
  const query = useQuery({ queryKey: key, queryFn: api.getStorageProviders });
  const [form, setForm] = useState<api.StorageInput | null>(null);
  const save = useMutation({
    mutationFn: api.createStorageProvider,
    onSuccess: () => {
      setForm(null);
      void client.invalidateQueries({ queryKey: key });
    },
    onError: report,
  });
  const remove = useMutation({
    mutationFn: api.deleteStorageProvider,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: report,
  });
  return (
    <>
      <Text style={styles.muted}>
        Connect your own S3-compatible storage for music uploads.
      </Text>
      <Button
        onPress={() =>
          setForm({
            label: "",
            endpoint: "",
            bucket: "",
            access_key: "",
            secret_key: "",
            region: "auto",
            public_url: "",
          })
        }
      >
        Add storage
      </Button>
      {query.isLoading && <ActivityIndicator color={colors.primary} />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data?.map((item) => (
        <View style={styles.card} key={item.id}>
          <View style={styles.row}>
            <Text style={styles.title}>{item.label}</Text>
            <TouchableOpacity
              disabled={remove.isPending}
              accessibilityLabel={`Delete ${item.label}`}
              onPress={() =>
                confirmDelete(item.label, () => remove.mutate(item.id))
              }
            >
              <Feather name="trash-2" color={colors.textMuted} size={20} />
            </TouchableOpacity>
          </View>
          <Text style={styles.muted}>
            {item.bucket} · {item.region}
          </Text>
          <Text style={styles.muted}>
            {item.verified_at ? "Verified" : "Not verified"}
          </Text>
        </View>
      ))}
      {query.data?.length === 0 && (
        <Text style={styles.muted}>No storage providers connected.</Text>
      )}
      {form && (
        <PickerSheet
          title="Add storage"
          onClose={() => {
            if (!save.isPending) setForm(null);
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {(
              [
                { key: "label", label: "Name" },
                { key: "endpoint", label: "Endpoint URL" },
                { key: "bucket", label: "Bucket" },
                { key: "region", label: "Region" },
                { key: "access_key", label: "Access key" },
                { key: "secret_key", label: "Secret key" },
                { key: "public_url", label: "Public URL (optional)" },
              ] as const
            ).map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={form[field.key] ?? ""}
                onChange={(value) => setForm({ ...form, [field.key]: value })}
                secure={field.key === "secret_key"}
              />
            ))}
            <Button
              disabled={
                save.isPending ||
                !form.label.trim() ||
                !/^https?:\/\//.test(form.endpoint) ||
                !form.bucket.trim() ||
                !form.access_key.trim() ||
                !form.secret_key.trim()
              }
              onPress={() => save.mutate(form)}
            >
              {save.isPending ? "Connecting…" : "Connect storage"}
            </Button>
          </ScrollView>
        </PickerSheet>
      )}
    </>
  );
}
const wrappedNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const formatWrappedNumber = (value?: number) =>
  wrappedNumber.format(Number.isFinite(value) ? (value ?? 0) : 0);

function WrappedArt({
  uri,
  artist = false,
  grid = false,
}: {
  uri?: string;
  artist?: boolean;
  grid?: boolean;
}) {
  const [failedUri, setFailedUri] = useState<string>();
  return (
    <View
      style={[
        {
          overflow: "hidden",
          backgroundColor: colors.surface2,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: artist ? 24 : 8,
        },
        grid ? { width: "100%", aspectRatio: 1 } : { width: 48, height: 48 },
      ]}
    >
      {uri && uri !== failedUri ? (
        <Image
          source={uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Feather
          name={artist ? "user" : "music"}
          size={grid ? 32 : 22}
          color={colors.textMuted}
        />
      )}
    </View>
  );
}

function Wrapped() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState<api.WrappedPeriod>("year");
  const did = storage.getDid() ?? "";
  const query = useQuery({
    queryKey: ["wrapped", did, year, period],
    queryFn: () => api.getWrapped(did, year, period),
    enabled: !!did,
  });
  const data = query.data;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {(
          [
            { key: "year", label: "Year" },
            { key: "3months", label: "3 months" },
            { key: "month", label: "Month" },
            { key: "2weeks", label: "2 weeks" },
            { key: "week", label: "Week" },
          ] as const
        ).map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => setPeriod(item.key)}
            style={[
              styles.pill,
              period === item.key && { backgroundColor: colors.primary },
            ]}
          >
            <Text>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {period === "year" && (
        <View style={styles.row}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Previous year"
            onPress={() => setYear(year - 1)}
            style={styles.yearButton}
          >
            <Feather name="chevron-left" size={20} color={colors.text} />
            <Text>Previous</Text>
          </TouchableOpacity>
          <Text>{year}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Next year"
            accessibilityState={{ disabled: year >= new Date().getFullYear() }}
            disabled={year >= new Date().getFullYear()}
            onPress={() => setYear(year + 1)}
            style={[
              styles.yearButton,
              year >= new Date().getFullYear() && { opacity: 0.45 },
            ]}
          >
            <Text>Next</Text>
            <Feather name="chevron-right" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}
      {query.isLoading && <ActivityIndicator color={colors.primary} />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {data && (
        <>
          <View style={styles.wrappedGrid}>
            {[
              { label: "Scrobbles", value: data.totalScrobbles },
              {
                label: "Minutes listened",
                value: data.totalListeningTimeMinutes,
              },
              { label: "New artists", value: data.newArtistsCount },
              { label: "Longest streak (days)", value: data.longestStreak },
            ].map((stat) => (
              <View key={stat.label} style={styles.wrappedStat}>
                <Text
                  style={styles.wrappedNumber}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {formatWrappedNumber(stat.value)}
                </Text>
                <Text style={styles.muted}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {[
            {
              title: "Top artists",
              artist: true,
              rows: (data.topArtists ?? []).map((item) => ({
                id: item.id,
                name: item.name,
                subtitle: "",
                artwork: item.picture,
                count: item.playCount,
              })),
            },
            {
              title: "Top tracks",
              artist: false,
              rows: (data.topTracks ?? []).map((item) => ({
                id: item.id,
                name: item.title,
                subtitle: item.artist,
                artwork: item.albumArt,
                count: item.playCount,
              })),
            },
          ].map((section) => (
            <View key={section.title} style={styles.card}>
              <Text style={styles.title}>{section.title}</Text>
              {section.rows.slice(0, 10).map((item, index) => (
                <View key={item.id} style={styles.row}>
                  <Text style={{ color: colors.textMuted, minWidth: 18 }}>
                    {index + 1}
                  </Text>
                  <WrappedArt uri={item.artwork} artist={section.artist} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text numberOfLines={2} style={{ fontWeight: "600" }}>
                      {item.name}
                    </Text>
                    {!!item.subtitle && (
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.textMuted, fontSize: 12 }}
                      >
                        {item.subtitle}
                      </Text>
                    )}
                    <Text style={styles.wrappedCount}>
                      {formatWrappedNumber(item.count)} plays
                    </Text>
                  </View>
                </View>
              ))}
              {section.rows.length === 0 && (
                <Text style={styles.muted}>No listens in this period.</Text>
              )}
            </View>
          ))}
          <View style={styles.card}>
            <Text style={styles.title}>Top albums</Text>
            <View style={styles.wrappedGrid}>
              {(data.topAlbums ?? []).slice(0, 10).map((album, index) => (
                <View key={album.id} style={{ width: "48%", gap: 6 }}>
                  <WrappedArt uri={album.albumArt} grid />
                  <Text numberOfLines={2} style={{ fontWeight: "600" }}>
                    {index + 1}. {album.title}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={{ color: colors.textMuted, fontSize: 12 }}
                  >
                    {album.artist}
                  </Text>
                  <Text style={styles.wrappedCount}>
                    {formatWrappedNumber(album.playCount)} plays
                  </Text>
                </View>
              ))}
            </View>
            {!data.topAlbums?.length && (
              <Text style={styles.muted}>No listens in this period.</Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Top genres</Text>
            {(data.topGenres ?? []).slice(0, 10).map((genre, index) => (
              <View key={genre.genre} style={styles.row}>
                <Text style={{ flex: 1 }}>
                  {index + 1}. {genre.genre}
                </Text>
                <Text style={styles.wrappedCount}>
                  {formatWrappedNumber(genre.count)}
                </Text>
              </View>
            ))}
            {!data.topGenres?.length && (
              <Text style={styles.muted}>No listens in this period.</Text>
            )}
          </View>
        </>
      )}
    </>
  );
}
export default function Account({
  route,
}: {
  route: RouteProp<RootStackParamList, "Account">;
}) {
  const navigation = useNavigation();
  const token = useAtomValue(authTokenAtom);
  const section = route.params.section;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.row, { padding: 16 }]}>
        <TouchableOpacity
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>{section}</Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {!token ? (
          <Text>Sign in to manage your account.</Text>
        ) : section === "API Keys" ? (
          <Credentials kind="keys" />
        ) : section === "Access tokens" ? (
          <Credentials kind="tokens" />
        ) : section === "Mirror sources" ? (
          <Mirrors />
        ) : section === "Storage" ? (
          <Storage />
        ) : (
          <Wrapped />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  yearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  wrappedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 20,
    marginTop: 16,
  },
  wrappedStat: {
    width: "48%",
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  wrappedNumber: {
    fontSize: 26,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  wrappedCount: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  card: {
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  title: { fontSize: 18, fontWeight: "700", flexShrink: 1 },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 5,
  },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    marginVertical: 8,
  },
  secret: {
    backgroundColor: colors.surface2,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    fontSize: 12,
  },
  pill: {
    padding: 12,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: colors.surface2,
  },
});
