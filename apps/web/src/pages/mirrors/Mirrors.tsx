import {
  IconBroadcast,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLock,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "baseui/button";
import { Checkbox, LABEL_PLACEMENT, STYLE_TYPE } from "baseui/checkbox";
import { FormControl } from "baseui/form-control";
import { Input } from "baseui/input";
import { Tab, Tabs } from "baseui/tabs-motion";
import { LabelSmall } from "baseui/typography";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  MirrorProvider,
  MirrorSourceView,
  getMirrorSources,
  putMirrorSource,
} from "../../api/mirror";
import { profileAtom } from "../../atoms/profile";
import Main from "../../layouts/Main";

const inputOverrides = {
  Root: {
    style: {
      backgroundColor: "var(--color-input-background)",
      borderColor: "var(--color-input-background)",
    },
  },
  InputContainer: {
    style: { backgroundColor: "var(--color-input-background)" },
  },
  Input: {
    style: { color: "var(--color-text)", caretColor: "var(--color-text)" },
  },
  MaskToggleHideIcon: {
    component: () => (
      <IconEyeOff className="text-[var(--color-text-muted)]" size={18} />
    ),
  },
  MaskToggleShowIcon: {
    component: () => (
      <IconEye className="text-[var(--color-text-muted)]" size={18} />
    ),
  },
};

const PRIMARY_BUTTON_OVERRIDES = {
  BaseButton: {
    style: ({ $disabled }: { $disabled?: boolean }) => ({
      backgroundColor: "var(--color-primary)",
      color: "#fff",
      opacity: $disabled ? 0.4 : 1,
      ":hover": {
        backgroundColor: "var(--color-primary)",
        opacity: $disabled ? 0.4 : 0.85,
      },
    }),
  },
};

const TOGGLE_OVERRIDES = {
  Toggle: {
    style: {
      backgroundColor: "#fff",
    },
  },
  ToggleTrack: {
    style: {
      backgroundColor: "var(--color-toggle-track)",
    },
  },
};

const TAB_OVERRIDES = {
  Tab: {
    style: {
      color: "var(--color-text)",
      backgroundColor: "var(--color-background) !important",
    },
  },
};

const TABS_OVERRIDES = {
  TabHighlight: {
    style: {
      backgroundColor: "var(--color-purple)",
    },
  },
  TabBorder: {
    style: {
      display: "none",
    },
  },
};

const PROVIDER_LABEL: Record<MirrorProvider, string> = {
  lastfm: "Last.fm",
  listenbrainz: "ListenBrainz",
  tealfm: "Teal.fm",
};

const LINK_CLASS =
  "text-[var(--color-primary)] no-underline hover:opacity-80";

const PROVIDER_DESCRIPTION: Record<MirrorProvider, React.ReactNode> = {
  lastfm:
    "Poll your Last.fm recent tracks every 30 seconds and mirror new scrobbles into Rocksky.",
  listenbrainz:
    "Poll your ListenBrainz listens every 30 seconds and mirror new ones into Rocksky.",
  tealfm: (
    <>
      Listen to your Teal.fm play events on{" "}
      <a
        href="https://atproto.com/blog/jetstream"
        target="_blank"
        rel="noreferrer"
        className={LINK_CLASS}
      >
        Jetstream
      </a>{" "}
      and mirror them into Rocksky in real time.
    </>
  ),
};

const PROVIDER_CREDENTIAL_LABEL: Record<MirrorProvider, string> = {
  lastfm: "Last.fm API key",
  listenbrainz: "ListenBrainz user token",
  tealfm: "",
};

const TAB_ORDER: MirrorProvider[] = ["lastfm", "listenbrainz", "tealfm"];

// Both fields are required to make the Save button appear. The username goes
// to the external service; the API key gets encrypted at rest before storage.
//
// When the user already has a saved credential we preload the apiKey field
// with REDACTED_PLACEHOLDER so the form *looks* hydrated. On submit, if the
// value still equals REDACTED_PLACEHOLDER we omit `apiKey` from the payload
// — meaning "keep the existing server-side value".
const REDACTED_PLACEHOLDER = "••••••••";

const credentialsSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  apiKey: z.string().min(1, "API key is required"),
});

type CredentialsForm = z.infer<typeof credentialsSchema>;

function ProviderPanel({
  source,
  onPut,
  busy,
}: {
  source: MirrorSourceView;
  onPut: (input: {
    enabled?: boolean;
    externalUsername?: string;
    apiKey?: string;
  }) => void;
  busy: boolean;
}) {
  const needsCredentials =
    source.provider === "lastfm" || source.provider === "listenbrainz";

  const initialApiKey = source.hasCredentials ? REDACTED_PLACEHOLDER : "";

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isValid, errors, isDirty },
  } = useForm<CredentialsForm>({
    resolver: zodResolver(credentialsSchema),
    mode: "onChange",
    defaultValues: {
      username: source.externalUsername ?? "",
      apiKey: initialApiKey,
    },
  });

  // Keep the form in sync when the server-side row is refetched (e.g. another
  // tab saved the credential or the user rotated the key on another device).
  useEffect(() => {
    reset({
      username: source.externalUsername ?? "",
      apiKey: source.hasCredentials ? REDACTED_PLACEHOLDER : "",
    });
  }, [source.externalUsername, source.hasCredentials, reset]);

  // The toggle requires credentials persisted server-side: the mirror process
  // can't authenticate against typed-but-unsaved values.
  const credentialsReady =
    !needsCredentials ||
    (source.hasCredentials && !!source.externalUsername);

  const submitCredentials = (values: CredentialsForm) => {
    const trimmedUsername = values.username.trim();
    onPut({
      externalUsername: trimmedUsername,
      // The placeholder stays in the field when the user only edited the
      // username. Dropping `apiKey` from the payload tells the API to keep
      // the previously-encrypted value.
      apiKey:
        values.apiKey === REDACTED_PLACEHOLDER ? undefined : values.apiKey,
    });
    reset({
      username: trimmedUsername,
      apiKey: REDACTED_PLACEHOLDER,
    });
  };

  // Don't surface a Save button when the form is unchanged from its loaded
  // state — that would just no-op against the server.
  const apiKeyValue = watch("apiKey");
  const apiKeyChanged =
    apiKeyValue !== "" && apiKeyValue !== REDACTED_PLACEHOLDER;
  const canSave = isValid && (isDirty || apiKeyChanged) && !busy;

  return (
    <div className="pt-[16px]">
      <div
        className="rounded-xl p-[16px] mb-[16px] flex items-start gap-[12px]"
        style={{
          backgroundColor: "var(--color-surface)",
        }}
      >
        <IconBroadcast
          size={20}
          color="var(--color-primary)"
          className="shrink-0 mt-[2px]"
        />
        <div className="min-w-0 flex-1">
          <p
            className="font-semibold text-base m-[0px]"
            style={{ color: "var(--color-text)" }}
          >
            {PROVIDER_LABEL[source.provider]}
          </p>
          <p
            className="text-xs m-[0px] mt-[4px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {PROVIDER_DESCRIPTION[source.provider]}
          </p>
        </div>
      </div>

      {needsCredentials && (
        <div
          className="rounded-xl p-[16px] mb-[16px]"
          style={{
            backgroundColor: "var(--color-surface)",
          }}
        >
          <p
            className="font-semibold text-sm m-[0px] mb-[12px]"
            style={{ color: "var(--color-text)" }}
          >
            Credentials
          </p>
          <form onSubmit={handleSubmit(submitCredentials)} noValidate>
            <FormControl label="Username" error={errors.username?.message}>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder={
                      source.provider === "lastfm"
                        ? "lastfm-username"
                        : "listenbrainz-username"
                    }
                    overrides={inputOverrides}
                    error={!!errors.username}
                  />
                )}
              />
            </FormControl>
            <FormControl
              label={PROVIDER_CREDENTIAL_LABEL[source.provider]}
              error={errors.apiKey?.message}
              caption={
                source.hasCredentials ? (
                  <span className="flex items-center gap-[4px]">
                    <IconCheck size={14} color="#4ade80" />
                    Saved — enter a new value to rotate.
                  </span>
                ) : (
                  "Encrypted at rest using XSalsa20-Poly1305."
                )
              }
            >
              <Controller
                name="apiKey"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="password"
                    placeholder={source.hasCredentials ? "••••••••" : "Paste your token"}
                    overrides={inputOverrides}
                    error={!!errors.apiKey}
                  />
                )}
              />
            </FormControl>
            {canSave && (
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="compact"
                  overrides={PRIMARY_BUTTON_OVERRIDES}
                >
                  Save credentials
                </Button>
              </div>
            )}
          </form>
        </div>
      )}

      {source.provider === "tealfm" && (
        <div
          className="rounded-xl p-[16px] mb-[16px]"
          style={{
            backgroundColor: "var(--color-surface)",
          }}
        >
          <LabelSmall className="!text-[var(--color-text-muted)] m-[0px]">
            Teal.fm uses your{" "}
            <a
              href="https://atproto.com/specs/did"
              target="_blank"
              rel="noreferrer"
              className={LINK_CLASS}
            >
              ATProto DID
            </a>{" "}
            — no credentials required.
          </LabelSmall>
        </div>
      )}

      <div
        className="rounded-xl p-[16px] flex items-center justify-between"
        style={{
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="min-w-0 flex-1 pr-[12px]">
          <p
            className="font-semibold text-sm m-[0px]"
            style={{ color: "var(--color-text)" }}
          >
            Mirror enabled
          </p>
          <p
            className="text-xs m-[0px] mt-[4px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {source.enabled
              ? "Mirroring is active. Plays will start appearing in your Rocksky scrobbles."
              : needsCredentials && !credentialsReady
                ? "Save your username and API key before enabling."
                : "Flip the toggle to start mirroring."}
          </p>
        </div>
        <Checkbox
          checked={source.enabled}
          checkmarkType={STYLE_TYPE.toggle_round}
          disabled={busy || (!source.enabled && !credentialsReady)}
          labelPlacement={LABEL_PLACEMENT.right}
          overrides={TOGGLE_OVERRIDES}
          onChange={(e) => onPut({ enabled: e.target.checked })}
        />
      </div>

      {(source.lastPolledAt || source.lastScrobbleSeenAt) && (
        <div className="mt-[12px] px-[4px] text-xs" style={{ color: "var(--color-text-muted)" }}>
          {source.lastPolledAt && (
            <p className="m-[0px]">
              Last polled: {new Date(source.lastPolledAt).toLocaleString()}
            </p>
          )}
          {source.lastScrobbleSeenAt && (
            <p className="m-[0px]">
              Watermark: {new Date(source.lastScrobbleSeenAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MirrorsPage() {
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jwt = localStorage.getItem("token");
  const [activeKey, setActiveKey] = useState<React.Key>("lastfm");

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["mirror-sources"],
    queryFn: getMirrorSources,
    enabled: !!jwt,
  });

  const updateMutation = useMutation({
    mutationFn: putMirrorSource,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["mirror-sources"] }),
  });

  if (!jwt || !profile) {
    navigate({ to: "/" });
    return null;
  }

  if (profile.did !== "did:plc:7vdlgi2bflelz7mmuxoqjfcr") {
    navigate({ to: "/" });
    return null;
  }

  // Index for fast lookup. If the API somehow returned fewer than three rows
  // (older deployment, transient error), fall back to a disabled stub so each
  // tab still renders a usable panel.
  const byProvider = new Map(sources.map((s) => [s.provider, s]));
  const stub = (p: MirrorProvider): MirrorSourceView => ({
    provider: p,
    enabled: false,
    hasCredentials: false,
  });

  return (
    <Main>
      <div className="px-[16px] pt-[16px] pb-[96px] max-w-2xl mx-auto">
        <h2
          className="text-xl font-bold m-[0px] mt-[24px] mb-[16px]"
          style={{ color: "var(--color-text)" }}
        >
          Mirror sources
        </h2>

        <div
          className="rounded-xl p-[16px] mb-[16px] flex items-start gap-[12px]"
          style={{
            backgroundColor: "var(--color-surface)",
          }}
        >
          <IconLock
            size={18}
            color="var(--color-text-muted)"
            className="shrink-0 mt-[2px]"
          />
          <LabelSmall className="!text-[var(--color-text-muted)] m-[0px]">
            Credentials are encrypted at rest using XSalsa20-Poly1305 and never
            returned by the API. Mirrored scrobbles are deduplicated against
            existing ones within a ±120 second window.
          </LabelSmall>
        </div>

        <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => setActiveKey(activeKey)}
          overrides={TABS_OVERRIDES}
          activateOnFocus
        >
          {TAB_ORDER.map((provider) => (
            <Tab
              key={provider}
              title={PROVIDER_LABEL[provider]}
              overrides={TAB_OVERRIDES}
            >
              {isLoading ? (
                <p
                  className="text-sm mt-[16px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Loading…
                </p>
              ) : (
                <ProviderPanel
                  source={byProvider.get(provider) ?? stub(provider)}
                  busy={updateMutation.isPending}
                  onPut={(input) =>
                    updateMutation.mutate({ provider, ...input })
                  }
                />
              )}
            </Tab>
          ))}
        </Tabs>
      </div>
    </Main>
  );
}
