import Feather from "@expo/vector-icons/Feather";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type LibraryKind,
  type LibrarySource,
  libraryProviders,
  remoteLibraries,
} from "../../api/remoteLibraries";
import { Text } from "../../components/Text";
import { colors } from "../../theme";
import { type ConnectionForm, connectionSchema } from "./connectionSchema";
import LibraryLogo from "./LibraryLogo";

export default function LibrarySources({
  selected,
  add,
  onSelect,
  onClose,
}: {
  selected: string;
  add: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const sources = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
  });
  const [screen, setScreen] = useState<"sources" | "providers" | "connect">(
    add ? "providers" : "sources",
  );
  const [search, setSearch] = useState("");
  const searchTerm = search.trim().toLocaleLowerCase();
  const filteredSources = (sources.data?.sources ?? []).filter((source) => {
    const providerName =
      libraryProviders.find((p) => p.kind === source.kind)?.title ??
      source.kind;
    return `${source.name} ${providerName} ${source.baseUrl}`
      .toLocaleLowerCase()
      .includes(searchTerm);
  });
  const [existing, setExisting] = useState<LibrarySource>();
  const { control, watch, reset, setValue, handleSubmit } =
    useForm<ConnectionForm>({
      resolver: zodResolver(connectionSchema(existing)),
      defaultValues: {
        kind: "navidrome",
        name: "",
        baseUrl: "",
        username: "",
        password: "",
        token: "",
      },
      mode: "onTouched",
    });
  const config = watch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<LibrarySource[]>([]);
  const [scanning, setScanning] = useState(false);
  const [searched, setSearched] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const provider =
    libraryProviders.find((p) => p.kind === config.kind) ?? libraryProviders[0];
  const back = () => {
    Keyboard.dismiss();
    if (screen === "connect") {
      setScreen(config.id ? "sources" : "providers");
      setError("");
    } else if (screen === "providers" && !add) {
      setScreen("sources");
    } else onClose();
  };
  const connect = (kind: LibraryKind, existing?: LibrarySource) => {
    setExisting(existing);
    reset(
      existing
        ? { ...existing, password: "", token: "" }
        : {
            kind,
            name: (
              libraryProviders.find((p) => p.kind === kind) ??
              libraryProviders[0]
            ).title,
            baseUrl: "",
            username: "",
            password: "",
            token: "",
          },
    );
    setDevices([]);
    setSearched(false);
    setError("");
    setScreen("connect");
  };
  const save = async (values: ConnectionForm) => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    setError("");
    try {
      const result = await remoteLibraries.save(values);
      await cache.invalidateQueries({ queryKey: ["remote-libraries"] });
      cache.removeQueries({ queryKey: ["remote-library", result.source.id] });
      if (alive.current) onSelect(result.source.id);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Could not connect");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const discover = async () => {
    if (busy || (config.kind !== "upnp" && config.kind !== "kodi")) return;
    setScanning(true);
    setBusy(true);
    setError("");
    try {
      const r = await remoteLibraries.discover(config.kind);
      if (alive.current) {
        setDevices(r.devices);
        setSearched(true);
      }
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      if (alive.current) {
        setBusy(false);
        setScanning(false);
      }
    }
  };
  const disconnect = (source: LibrarySource) =>
    Alert.alert(
      "Disconnect library?",
      `Remove ${source.name} from this device? Your server’s music will stay unchanged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await remoteLibraries.remove(source.id);
                cache.removeQueries({
                  queryKey: ["remote-library", source.id],
                });
                await cache.invalidateQueries({
                  queryKey: ["remote-libraries"],
                });
                if (selected === source.id) onSelect("device");
              } catch (e) {
                if (alive.current) setError(String(e));
              }
            })();
          },
        },
      ],
    );
  const field = (
    label: string,
    key: "name" | "baseUrl" | "username" | "password" | "token",
    placeholder: string,
    secret = false,
  ) => (
    <Controller
      key={key}
      control={control}
      name={key}
      render={({
        field: { value, onChange, onBlur, ref },
        fieldState: { error: fieldError },
      }) => (
        <View style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={fieldError?.message}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={secret}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            keyboardType={key === "baseUrl" ? "url" : "default"}
            style={[
              styles.input,
              fieldError && { borderColor: colors.primary },
            ]}
          />
          {fieldError && (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.primary, fontSize: 13 }}
            >
              {fieldError.message}
            </Text>
          )}
        </View>
      )}
    />
  );
  return (
    <Modal visible animationType="slide" onRequestClose={back}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={back}
            style={styles.icon}
          >
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>
            {screen === "sources"
              ? "Your libraries"
              : screen === "providers"
                ? "Connect a library"
                : config.id
                  ? "Edit connection"
                  : "Connect to server"}
          </Text>
          {screen === "sources" && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Connect a library"
              style={styles.icon}
              onPress={() => {
                Keyboard.dismiss();
                setScreen("providers");
              }}
            >
              <Feather name="plus" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {screen === "sources" && (
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 8,
              }}
            >
              <View style={styles.search}>
                <Feather name="search" size={18} color={colors.textMuted} />
                <TextInput
                  accessibilityLabel="Search saved libraries"
                  placeholder="Search saved libraries"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
                {!!search && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Clear library search"
                    onPress={() => setSearch("")}
                    style={styles.icon}
                  >
                    <Feather name="x" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flex: 1 }}
            contentContainerStyle={styles.body}
          >
            {screen === "sources" && (
              <>
                <Text style={styles.note}>
                  Choose where your music comes from.
                </Text>
                {(
                  [
                    {
                      id: "device",
                      name: "Local music",
                      kind: "device",
                      hint: "Music on this device",
                    },
                    {
                      id: "uploaded",
                      name: "Uploaded music",
                      kind: "uploaded",
                      hint: "Your Rocksky library",
                    },
                  ] as const
                ).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected === item.id }}
                    onPress={() => onSelect(item.id)}
                    style={[
                      styles.row,
                      styles.libraryRow,
                      selected === item.id && styles.selectedLibrary,
                    ]}
                  >
                    <LibraryLogo kind={item.kind} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.note}>{item.hint}</Text>
                    </View>
                    {selected === item.id && (
                      <Feather name="check" color={colors.primary} size={22} />
                    )}
                  </TouchableOpacity>
                ))}
                <Text style={styles.section}>CONNECTED SERVERS</Text>
                {sources.isLoading && (
                  <ActivityIndicator color={colors.primary} />
                )}
                {sources.isError && (
                  <TouchableOpacity onPress={() => void sources.refetch()}>
                    <Text style={styles.note}>
                      Could not load connections. Tap to retry.
                    </Text>
                  </TouchableOpacity>
                )}
                {filteredSources.map((source) => (
                  <View
                    style={[
                      styles.row,
                      styles.libraryRow,
                      selected === source.id && styles.selectedLibrary,
                    ]}
                    key={source.id}
                  >
                    <TouchableOpacity
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected === source.id }}
                      onPress={() => onSelect(source.id)}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <LibraryLogo kind={source.kind} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.name}>
                          {source.name}
                        </Text>
                        <Text numberOfLines={1} style={styles.note}>
                          {source.baseUrl}
                        </Text>
                      </View>
                      {selected === source.id && (
                        <Feather
                          name="check"
                          color={colors.primary}
                          size={20}
                        />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={`Edit ${source.name}`}
                      accessibilityRole="button"
                      onPress={() => connect(source.kind, source)}
                      style={styles.icon}
                    >
                      <Feather
                        name="edit-2"
                        size={18}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Disconnect ${source.name}`}
                      onPress={() => disconnect(source)}
                      style={styles.icon}
                    >
                      <Feather
                        name="trash-2"
                        size={18}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
                {sources.data?.sources.length === 0 && (
                  <Text style={styles.note}>
                    Your connected music servers will appear here.
                  </Text>
                )}
                {!!sources.data?.sources.length &&
                  filteredSources.length === 0 && (
                    <Text style={styles.note}>
                      No libraries match your search.
                    </Text>
                  )}
              </>
            )}
            {screen === "providers" && (
              <>
                <Text style={styles.note}>
                  Bring your collection to Rocksky. Listen through the same
                  player, wherever your music lives.
                </Text>
                {libraryProviders.map((p) => (
                  <TouchableOpacity
                    key={p.kind}
                    style={styles.row}
                    onPress={() => connect(p.kind)}
                    accessibilityRole="button"
                  >
                    <LibraryLogo kind={p.kind} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{p.title}</Text>
                      <Text style={styles.note}>{p.hint}</Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      color={colors.textMuted}
                      size={20}
                    />
                  </TouchableOpacity>
                ))}
              </>
            )}
            {screen === "connect" && (
              <>
                <View style={styles.row}>
                  <LibraryLogo kind={config.kind} size={56} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{provider.title}</Text>
                    <Text style={styles.note}>{provider.hint}</Text>
                  </View>
                </View>
                {(config.kind === "upnp" || config.kind === "kodi") && (
                  <>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busy}
                      style={styles.secondary}
                      onPress={() => void discover()}
                    >
                      <Feather
                        name="radio"
                        size={20}
                        color={colors.textMuted}
                      />
                      <Text>
                        {scanning ? "Scanning network…" : "Scan this network"}
                      </Text>
                    </TouchableOpacity>
                    {devices.map((device) => (
                      <TouchableOpacity
                        key={device.baseUrl}
                        style={styles.row}
                        disabled={busy}
                        onPress={() => {
                          setValue("baseUrl", device.baseUrl, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                          setValue("name", device.name, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                        }}
                      >
                        <LibraryLogo kind={config.kind} />
                        <View style={{ flex: 1 }}>
                          <Text>{device.name}</Text>
                          <Text numberOfLines={2} style={styles.note}>
                            {device.baseUrl}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {searched && !devices.length && (
                      <Text style={styles.note}>
                        {config.kind === "kodi"
                          ? "No Kodi servers found. Check that you’re on the same Wi-Fi and enable HTTP remote control and Zeroconf announcements in Kodi, or enter its server URL below."
                          : "No servers found. Check that you’re on the same Wi-Fi, or enter a device description URL below."}
                      </Text>
                    )}
                  </>
                )}
                {field("Library name", "name", provider.title)}
                {field(
                  config.kind === "upnp"
                    ? "Device description URL"
                    : "Server URL",
                  "baseUrl",
                  provider.placeholder,
                )}
                {config.kind !== "upnp" && config.kind !== "plex" && (
                  <>
                    {field("Username", "username", "Username")}
                    {field(
                      "Password",
                      "password",
                      config.id
                        ? "Leave blank to keep current password"
                        : "Password",
                      true,
                    )}
                  </>
                )}
                {config.kind === "plex" && (
                  <>
                    {field(
                      "Plex token",
                      "token",
                      config.id
                        ? "Leave blank to keep current token"
                        : "X-Plex-Token",
                      true,
                    )}
                    <Text style={styles.note}>
                      Use the token from Plex Web’s “View XML” URL. Connect
                      directly to your Plex Media Server.
                    </Text>
                  </>
                )}
                {config.kind === "kodi" && (
                  <Text style={styles.note}>
                    Enable “Allow remote control via HTTP” and “Announce
                    services to other systems” in Kodi’s Services settings to
                    discover it on your network.
                  </Text>
                )}
                <Text style={styles.note}>
                  Credentials are encrypted on this device. Use HTTPS when
                  connecting over the internet.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={handleSubmit(save)}
                  style={[styles.button, { opacity: busy ? 0.6 : 1 }]}
                >
                  <Text style={styles.buttonText}>
                    {busy && !scanning ? "Connecting…" : "Connect library"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {busy && <ActivityIndicator color={colors.primary} />}
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: colors.primary }}>
                {error}
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  note: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  name: { fontSize: 16, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  libraryRow: {
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
  },
  selectedLibrary: {
    backgroundColor: `${colors.primary}1F`,
  },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: colors.textMuted,
    marginTop: 12,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 4,
    gap: 8,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: colors.text,
    fontFamily: "RockfordSansRegular",
  },
  field: { gap: 8 },
  label: { fontSize: 13, color: colors.textMuted },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: "RockfordSansRegular",
  },
  button: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondary: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface2,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
});
