import { IconBroadcast, IconLock } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "baseui/button";
import { Checkbox, STYLE_TYPE } from "baseui/checkbox";
import { FormControl } from "baseui/form-control";
import { Input } from "baseui/input";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MirrorProvider,
  MirrorSourceView,
  getMirrorSources,
  putMirrorSource,
} from "../../api/mirror";
import Main from "../../layouts/Main";

const inputOverrides = {
  Root: {
    style: {
      backgroundColor: "var(--color-input-background)",
      borderColor: "var(--color-input-background)",
    },
  },
  InputContainer: { style: { backgroundColor: "var(--color-input-background)" } },
  Input: { style: { color: "var(--color-text)", caretColor: "var(--color-text)" } },
};

const PROVIDER_LABEL: Record<MirrorProvider, string> = {
  lastfm: "Last.fm",
  listenbrainz: "ListenBrainz",
  tealfm: "Teal.fm",
};

const PROVIDER_DESCRIPTION: Record<MirrorProvider, string> = {
  lastfm:
    "Poll your Last.fm recent tracks every 30s and mirror new scrobbles into Rocksky.",
  listenbrainz:
    "Poll your ListenBrainz listens every 30s and mirror new ones into Rocksky.",
  tealfm:
    "Listen to your Teal.fm play events on Jetstream and mirror them in real time.",
};

function SourceCard({
  source,
  onChange,
  busy,
}: {
  source: MirrorSourceView;
  onChange: (input: {
    enabled?: boolean;
    externalUsername?: string;
    apiKey?: string;
  }) => void;
  busy: boolean;
}) {
  const needsCredentials =
    source.provider === "lastfm" || source.provider === "listenbrainz";
  const [username, setUsername] = useState(source.externalUsername ?? "");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setUsername(source.externalUsername ?? "");
  }, [source.externalUsername]);

  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <IconBroadcast size={20} color="var(--color-primary)" className="shrink-0" />
          <div className="min-w-0">
            <p
              className="font-semibold text-base m-0"
              style={{ color: "var(--color-text)" }}
            >
              {PROVIDER_LABEL[source.provider]}
            </p>
            <p
              className="text-xs m-0"
              style={{ color: "var(--color-text-muted)" }}
            >
              {PROVIDER_DESCRIPTION[source.provider]}
            </p>
          </div>
        </div>
        <Checkbox
          checked={source.enabled}
          checkmarkType={STYLE_TYPE.toggle_round}
          disabled={
            busy ||
            (needsCredentials &&
              !source.enabled &&
              (!username.trim() || !(source.hasCredentials || apiKey)))
          }
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
      </div>

      {needsCredentials && (
        <div className="flex flex-col gap-3">
          <FormControl label="Username">
            <Input
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              placeholder={
                source.provider === "lastfm"
                  ? "lastfm-username"
                  : "listenbrainz-username"
              }
              overrides={inputOverrides}
            />
          </FormControl>
          <FormControl
            label={
              source.provider === "lastfm"
                ? "Last.fm API key"
                : "ListenBrainz user token"
            }
            caption={
              source.hasCredentials
                ? "Saved — leave blank to keep, or enter a new one to rotate."
                : "Encrypted at rest using XSalsa20-Poly1305."
            }
          >
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              type="password"
              placeholder={source.hasCredentials ? "••••••••" : "Paste your token"}
              overrides={inputOverrides}
            />
          </FormControl>
          <div className="flex justify-end">
            <Button
              size="compact"
              disabled={busy || (!username.trim() && !apiKey)}
              onClick={() => {
                onChange({
                  externalUsername: username.trim() || undefined,
                  apiKey: apiKey || undefined,
                });
                setApiKey("");
              }}
              overrides={{
                BaseButton: {
                  style: {
                    backgroundColor: "var(--color-primary)",
                    color: "#fff",
                  },
                },
              }}
            >
              Save credentials
            </Button>
          </div>
        </div>
      )}

      {source.provider === "tealfm" && (
        <p
          className="text-xs m-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          No credentials required — your Bluesky DID is enough.
        </p>
      )}
    </div>
  );
}

export default function MirrorsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jwt = localStorage.getItem("token");

  const { data: sources = [] } = useQuery({
    queryKey: ["mirror-sources"],
    queryFn: getMirrorSources,
    enabled: !!jwt,
  });

  const updateMutation = useMutation({
    mutationFn: putMirrorSource,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["mirror-sources"] }),
  });

  if (!jwt) {
    navigate("/");
    return null;
  }

  if (localStorage.getItem("did") !== "did:plc:7vdlgi2bflelz7mmuxoqjfcr") {
    navigate("/");
    return null;
  }

  return (
    <Main>
      <div className="px-4 pt-4 pb-24">
        <h2
          className="text-xl font-bold m-0 mb-4"
          style={{ color: "var(--color-text)" }}
        >
          Mirror sources
        </h2>

        <div
          className="rounded-xl p-3 mb-4 flex items-start gap-2"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <IconLock
            size={16}
            color="var(--color-text-muted)"
            className="shrink-0 mt-0.5"
          />
          <p
            className="text-xs m-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            Tokens are encrypted at rest using XSalsa20-Poly1305 and never
            returned by the API. Mirrored scrobbles are deduplicated against
            existing ones within a ±120 second window.
          </p>
        </div>

        {sources.map((s) => (
          <SourceCard
            key={s.provider}
            source={s}
            busy={updateMutation.isPending}
            onChange={(input) =>
              updateMutation.mutate({ provider: s.provider, ...input })
            }
          />
        ))}
      </div>
    </Main>
  );
}
