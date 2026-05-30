import {
  IconBroadcast,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLock,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "baseui/button";
import { Checkbox, LABEL_PLACEMENT, STYLE_TYPE } from "baseui/checkbox";
import { FormControl } from "baseui/form-control";
import { Input } from "baseui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
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

const PROVIDER_LABEL: Record<MirrorProvider, string> = {
  lastfm: "Last.fm",
  listenbrainz: "ListenBrainz",
  tealfm: "Teal.fm",
};

const LINK_CLASS =
  "text-[var(--color-primary)] no-underline hover:opacity-80";

const PROVIDER_DESCRIPTION: Record<MirrorProvider, ReactNode> = {
  lastfm:
    "Poll your Last.fm recent tracks every 30 seconds and mirror new scrobbles.",
  listenbrainz:
    "Poll your ListenBrainz listens every 30 seconds and mirror new ones.",
  tealfm: (
    <>
      Listen to Teal.fm play events on{" "}
      <a
        href="https://atproto.com/blog/jetstream"
        target="_blank"
        rel="noreferrer"
        className={LINK_CLASS}
      >
        Jetstream
      </a>{" "}
      and mirror them in real time.
    </>
  ),
};

const PROVIDER_CREDENTIAL_LABEL: Record<MirrorProvider, string> = {
  lastfm: "Last.fm API key",
  listenbrainz: "ListenBrainz user token",
  tealfm: "",
};

const TAB_ORDER: MirrorProvider[] = ["lastfm", "listenbrainz", "tealfm"];

// When credentials are already persisted server-side, the apiKey field is
// preloaded with REDACTED_PLACEHOLDER so the form looks hydrated. On submit
// we omit `apiKey` from the payload when the value still equals the
// placeholder — meaning "keep the existing server-side value".
const REDACTED_PLACEHOLDER = "••••••••";

const credentialsSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  apiKey: z.string().min(1, "API key is required"),
});

type CredentialsForm = z.infer<typeof credentialsSchema>;

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

function TabBar({
  active,
  onChange,
}: {
  active: MirrorProvider;
  onChange: (p: MirrorProvider) => void;
}) {
  return (
    <div
      className="flex flex-row gap-[4px] p-[4px] rounded-full mb-[16px]"
      style={{
        backgroundColor: "var(--color-surface)",
      }}
    >
      {TAB_ORDER.map((p) => {
        const isActive = active === p;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className="flex-1 py-[8px] px-[12px] border-none cursor-pointer rounded-full text-xs font-semibold"
            style={{
              backgroundColor: isActive ? "var(--color-primary)" : "transparent",
              color: isActive ? "#fff" : "var(--color-text)",
            }}
          >
            {PROVIDER_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

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
      apiKey: source.hasCredentials ? REDACTED_PLACEHOLDER : "",
    },
  });

  useEffect(() => {
    reset({
      username: source.externalUsername ?? "",
      apiKey: source.hasCredentials ? REDACTED_PLACEHOLDER : "",
    });
  }, [source.externalUsername, source.hasCredentials, reset]);

  const credentialsReady =
    !needsCredentials ||
    (source.hasCredentials && !!source.externalUsername);

  const submitCredentials = (values: CredentialsForm) => {
    const trimmedUsername = values.username.trim();
    onPut({
      externalUsername: trimmedUsername,
      apiKey:
        values.apiKey === REDACTED_PLACEHOLDER ? undefined : values.apiKey,
    });
    reset({
      username: trimmedUsername,
      apiKey: REDACTED_PLACEHOLDER,
    });
  };

  const apiKeyValue = watch("apiKey");
  const apiKeyChanged =
    apiKeyValue !== "" && apiKeyValue !== REDACTED_PLACEHOLDER;
  const canSave = isValid && (isDirty || apiKeyChanged) && !busy;

  return (
    <>
      <div
        className="rounded-xl p-[16px] mb-[12px] flex items-start gap-[12px]"
        style={{
          backgroundColor: "var(--color-surface)",
        }}
      >
        <IconBroadcast size={20} color="var(--color-primary)" className="shrink-0 mt-[2px]" />
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
          className="rounded-xl p-[16px] mb-[12px]"
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
          className="rounded-xl p-[16px] mb-[12px]"
          style={{
            backgroundColor: "var(--color-surface)",
          }}
        >
          <p
            className="text-xs m-[0px]"
            style={{ color: "var(--color-text-muted)" }}
          >
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
          </p>
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
              ? "Mirroring is active."
              : needsCredentials && !credentialsReady
                ? "Save credentials before enabling."
                : "Flip to start mirroring."}
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
        <div
          className="mt-[12px] px-[4px] text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
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
    </>
  );
}

export default function MirrorsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jwt = localStorage.getItem("token");
  const [active, setActive] = useState<MirrorProvider>("lastfm");

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

  if (!jwt) {
    navigate("/");
    return null;
  }
  if (localStorage.getItem("did") !== "did:plc:7vdlgi2bflelz7mmuxoqjfcr") {
    navigate("/");
    return null;
  }

  const byProvider = new Map(sources.map((s) => [s.provider, s]));
  const stub = (p: MirrorProvider): MirrorSourceView => ({
    provider: p,
    enabled: false,
    hasCredentials: false,
  });

  return (
    <Main>
      <div className="px-[16px] pt-[16px] pb-[96px]">
        <h2
          className="text-xl font-bold m-[0px] mt-[24px] mb-[16px]"
          style={{ color: "var(--color-text)" }}
        >
          Mirror sources
        </h2>

        <div
          className="rounded-xl p-[12px] mb-[16px] flex items-start gap-[8px]"
          style={{
            backgroundColor: "var(--color-surface)",
          }}
        >
          <IconLock
            size={16}
            color="var(--color-text-muted)"
            className="shrink-0 mt-[2px]"
          />
          <p
            className="text-xs m-[0px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Credentials are encrypted at rest using XSalsa20-Poly1305 and never
            returned by the API. Mirrored scrobbles are deduplicated within a
            ±120 second window.
          </p>
        </div>

        <TabBar active={active} onChange={setActive} />

        {isLoading ? (
          <p
            className="text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Loading…
          </p>
        ) : (
          <ProviderPanel
            source={byProvider.get(active) ?? stub(active)}
            busy={updateMutation.isPending}
            onPut={(input) => updateMutation.mutate({ provider: active, ...input })}
          />
        )}
      </div>
    </Main>
  );
}
