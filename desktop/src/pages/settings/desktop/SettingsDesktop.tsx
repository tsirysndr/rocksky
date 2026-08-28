import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import Main from "../../../layouts/Main";
import { useNfcStatus } from "../../../hooks/useNfc";
import { isTauri } from "../../../lib/tauri";
import {
  Card,
  CardHeader,
  CardHint,
  CardTitle,
  Header,
  Label,
  LabelHint,
  LoadingState,
  PageWrap,
  Row,
  Section,
  Subtitle,
  Title,
  Toggle,
} from "../audio/styles";
import {
  Button,
  GhostButton,
  NumberInput,
  StatusDot,
  StatusLine,
  TextInput,
  UsagePath,
} from "./styles";

const PLAYER_NAME_KEY = "desktopPlayerName";
const DEFAULT_PLAYER_NAME = "Rocksky";

type RemoteStatus = {
  connected: boolean;
  name: string | null;
};

type CacheConfig = {
  enabled: boolean;
  maxSizeMb: number;
};

type CacheStats = {
  files: number;
  bytes: number;
  dir: string;
  enabled: boolean;
  maxSizeMb: number;
};

function fmtMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function RemoteControlSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState(
    () => localStorage.getItem(PLAYER_NAME_KEY) || DEFAULT_PLAYER_NAME,
  );

  const status = useQuery({
    queryKey: ["desktop", "remote_status"],
    queryFn: () => invoke<RemoteStatus>("remote_status"),
    enabled: isTauri(),
  });

  const connect = useMutation({
    mutationFn: () =>
      invoke<RemoteStatus>("remote_connect", {
        token: localStorage.getItem("token") ?? "",
        name: name.trim() || DEFAULT_PLAYER_NAME,
      }),
    onSuccess: (data) =>
      queryClient.setQueryData(["desktop", "remote_status"], data),
  });

  const disconnect = useMutation({
    mutationFn: () => invoke<RemoteStatus>("remote_disconnect"),
    onSuccess: (data) =>
      queryClient.setQueryData(["desktop", "remote_status"], data),
  });

  const connected = status.data?.connected ?? false;
  const busy = connect.isPending || disconnect.isPending;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Remote control</CardTitle>
          <CardHint>
            Let other Rocksky apps (web, mobile) pick this computer as a
            playback device and control it remotely.
          </CardHint>
        </div>
      </CardHeader>

      <Row>
        <Label>
          Player name
          <LabelHint>
            Appears as “{name.trim() || DEFAULT_PLAYER_NAME} (Desktop)” in the
            miniplayer device picker
          </LabelHint>
        </Label>
        <TextInput
          type="text"
          value={name}
          placeholder={DEFAULT_PLAYER_NAME}
          onChange={(e) => {
            setName(e.target.value);
            localStorage.setItem(PLAYER_NAME_KEY, e.target.value);
          }}
        />
      </Row>

      <Row>
        <StatusLine>
          <StatusDot on={connected} />
          {connected
            ? `Connected as ${status.data?.name ?? ""}`
            : "Not connected"}
        </StatusLine>
        {connected ? (
          <GhostButton disabled={busy} onClick={() => disconnect.mutate()}>
            Disconnect
          </GhostButton>
        ) : (
          <Button disabled={busy} onClick={() => connect.mutate()}>
            Connect
          </Button>
        )}
      </Row>
      {connect.isError && (
        <CardHint>Could not connect: {String(connect.error)}</CardHint>
      )}
    </Card>
  );
}

function MediaCacheSection() {
  const queryClient = useQueryClient();
  const [maxSizeMb, setMaxSizeMb] = useState<string>("");

  const config = useQuery({
    queryKey: ["desktop", "cache_config"],
    queryFn: () => invoke<CacheConfig>("cache_get_config"),
    enabled: isTauri(),
  });

  const stats = useQuery({
    queryKey: ["desktop", "cache_stats"],
    queryFn: () => invoke<CacheStats>("cache_stats"),
    enabled: isTauri(),
    refetchInterval: 5000,
  });

  // Seed the size input once the persisted config arrives.
  useEffect(() => {
    if (config.data) {
      setMaxSizeMb(String(config.data.maxSizeMb));
    }
  }, [config.data]);

  const applyStats = (data: CacheStats) => {
    queryClient.setQueryData(["desktop", "cache_stats"], data);
    queryClient.setQueryData(["desktop", "cache_config"], {
      enabled: data.enabled,
      maxSizeMb: data.maxSizeMb,
    } satisfies CacheConfig);
  };

  const setConfig = useMutation({
    mutationFn: (next: CacheConfig) =>
      invoke<CacheStats>("cache_set_config", { config: next }),
    onSuccess: applyStats,
  });

  const clear = useMutation({
    mutationFn: () => invoke<CacheStats>("cache_clear"),
    onSuccess: applyStats,
  });

  const enabled = config.data?.enabled ?? false;
  const currentMax = config.data?.maxSizeMb ?? 0;

  const commitMaxSize = () => {
    const parsed = Math.floor(Number(maxSizeMb));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === currentMax) {
      setMaxSizeMb(String(currentMax));
      return;
    }
    setConfig.mutate({ enabled, maxSizeMb: parsed });
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Media cache</CardTitle>
          <CardHint>
            Keep streamed tracks on disk so they replay instantly, gapless and
            offline. Oldest files are evicted when the cache is full.
          </CardHint>
        </div>
      </CardHeader>

      <Row>
        <Label>
          Cache streamed tracks
          <LabelHint>Downloads finish in the background</LabelHint>
        </Label>
        <Toggle
          on={enabled}
          role="switch"
          aria-checked={enabled}
          aria-label="Cache streamed tracks"
          disabled={!config.data || setConfig.isPending}
          onClick={() =>
            setConfig.mutate({ enabled: !enabled, maxSizeMb: currentMax })
          }
        />
      </Row>

      <Row>
        <Label>
          Max size
          <LabelHint>In megabytes; enforced with oldest-first eviction</LabelHint>
        </Label>
        <NumberInput
          type="number"
          min={1}
          value={maxSizeMb}
          disabled={!config.data}
          onChange={(e) => setMaxSizeMb(e.target.value)}
          onBlur={commitMaxSize}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </Row>

      <Row>
        <Label>
          Usage
          {stats.data ? (
            <LabelHint>
              {stats.data.files} file{stats.data.files === 1 ? "" : "s"} ·{" "}
              {fmtMb(stats.data.bytes)} MB used of {stats.data.maxSizeMb} MB
              <UsagePath>{stats.data.dir}</UsagePath>
            </LabelHint>
          ) : (
            <LabelHint>—</LabelHint>
          )}
        </Label>
        <GhostButton
          disabled={clear.isPending || (stats.data?.files ?? 0) === 0}
          onClick={() => clear.mutate()}
        >
          Clear cache
        </GhostButton>
      </Row>
    </Card>
  );
}

function NfcSection() {
  const status = useNfcStatus();
  const reader = status.readers[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>NFC tags</CardTitle>
          <CardHint>
            Turn an NFC tag into a physical shortcut. Write one from the “…”
            menu of any library album or playlist, then tap it on the reader to
            start playing — from anywhere in the app.
          </CardHint>
        </div>
      </CardHeader>

      <Row>
        <Label>
          Reader
          <LabelHint>
            {reader
              ? status.cardPresent
                ? "A tag is on the reader"
                : "Waiting for a tag"
              : (status.error ??
                "Plug in a PC/SC reader (ACR122U and other ACS/CCID models)")}
          </LabelHint>
        </Label>
        <StatusLine>
          <StatusDot on={!!reader} />
          {reader ?? "Not connected"}
        </StatusLine>
      </Row>

      {status.readers.length > 1 && (
        <Row>
          <Label>
            Other readers
            <LabelHint>{status.readers.slice(1).join(", ")}</LabelHint>
          </Label>
        </Row>
      )}

      <Row>
        <Label>
          Supported tags
          <LabelHint>
            NFC Forum Type 2 — NTAG213/215/216 and MIFARE Ultralight. Writing
            replaces whatever the tag held.
          </LabelHint>
        </Label>
      </Row>
    </Card>
  );
}

export function SettingsDesktop() {
  return (
    <Main>
      <PageWrap>
        <Header>
          <Title>Desktop Settings</Title>
          <Subtitle>
            Settings specific to the Rocksky desktop app: remote control, local
            media caching and NFC tags.
          </Subtitle>
        </Header>

        {isTauri() ? (
          <Section>
            <RemoteControlSection />
            <MediaCacheSection />
            <NfcSection />
          </Section>
        ) : (
          <LoadingState>
            These settings are only available in the Rocksky desktop app.
          </LoadingState>
        )}
      </PageWrap>
    </Main>
  );
}

export default SettingsDesktop;
