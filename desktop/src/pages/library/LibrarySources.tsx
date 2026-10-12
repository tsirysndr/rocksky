import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconChevronRight, IconRadar } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalBody } from "baseui/modal";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  type LibraryKind,
  type LibrarySource,
  libraryProviders,
  remoteLibraries,
} from "../../api/remoteLibraries";
import LibraryLogo from "../../components/LibraryLogo";
import { type ConnectionForm, connectionSchema } from "./connectionSchema";

const Heading = styled.h2`
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const Note = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 19px;
  color: var(--color-placeholder);
`;

const Row = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  margin: 0 -12px;
  width: calc(100% + 24px);
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
  &:disabled { opacity: 0.6; cursor: default; }
`;

const Name = styled.span`
  display: block;
  font-size: 15px;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--color-placeholder);
`;

const Input = styled.input<{ invalid?: boolean }>`
  padding: 11px 14px;
  border-radius: 10px;
  border: 1px solid ${(p) => (p.invalid ? "var(--color-primary)" : "var(--color-border)")};
  background: var(--color-input-background);
  color: var(--color-text);
  font-size: 14px;
  font-family: RockfordSansRegular;
  outline: none;
  &::placeholder { color: var(--color-text-muted); }
  &:focus { border-color: var(--color-primary); }
`;

const ErrorText = styled.span`
  color: var(--color-primary);
  font-size: 13px;
`;

const Primary = styled.button`
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  font-family: RockfordSansMedium;
  font-size: 14px;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: default; }
`;

const Secondary = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-family: RockfordSansMedium;
  font-size: 14px;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: default; }
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 440px;
  max-width: 100%;
  padding-bottom: 8px;
  color: var(--color-text);
`;

const modalOverrides = {
  Root: { style: { zIndex: 50 } },
  Dialog: {
    style: {
      backgroundColor: "var(--color-background)",
      color: "var(--color-text)",
      borderRadius: "16px",
    },
  },
  Close: {
    style: {
      color: "var(--color-text)",
      ":hover": { color: "var(--color-text)", opacity: 0.8 },
    },
  },
};

export default function LibrarySources({
  existing,
  onClose,
  onSelect,
}: {
  existing?: LibrarySource;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [screen, setScreen] = useState<"providers" | "connect">(
    existing ? "connect" : "providers",
  );
  const { control, watch, reset, setValue, handleSubmit } =
    useForm<ConnectionForm>({
      resolver: zodResolver(connectionSchema(existing)),
      defaultValues: existing
        ? { ...existing, password: "" }
        : { kind: "navidrome", name: "", baseUrl: "", username: "", password: "" },
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

  const connect = (kind: LibraryKind) => {
    if (kind === "plyr") {
      if (busy) return;
      setBusy(true);
      setError("");
      void remoteLibraries
        .connectPlyr()
        .then(async (r) => {
          await cache.invalidateQueries({ queryKey: ["remote-libraries"] });
          if (alive.current) onSelect(r.source.id);
        })
        .catch((e) => {
          if (alive.current) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (alive.current) setBusy(false);
        });
      return;
    }
    reset({
      kind,
      name: libraryProviders.find((p) => p.kind === kind)?.title ?? "",
      baseUrl: "",
      username: "",
      password: "",
    });
    setDevices([]);
    setSearched(false);
    setError("");
    setScreen("connect");
  };

  const save = async (values: ConnectionForm) => {
    if (busy) return;
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
    if (busy) return;
    setScanning(true);
    setBusy(true);
    setError("");
    try {
      const r = await remoteLibraries.discover();
      if (alive.current) {
        setDevices(r.devices);
        setSearched(true);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) {
        setBusy(false);
        setScanning(false);
      }
    }
  };

  const field = (
    label: string,
    key: "name" | "baseUrl" | "username" | "password",
    placeholder: string,
    secret = false,
  ) => (
    <Controller
      key={key}
      control={control}
      name={key}
      render={({ field: f, fieldState: { error: fieldError } }) => (
        <Field>
          {label}
          <Input
            value={f.value ?? ""}
            onChange={f.onChange}
            onBlur={f.onBlur}
            ref={f.ref}
            placeholder={placeholder}
            type={secret ? "password" : key === "baseUrl" ? "url" : "text"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            invalid={!!fieldError}
          />
          {fieldError && <ErrorText role="alert">{fieldError.message}</ErrorText>}
        </Field>
      )}
    />
  );

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      closeable={!busy}
      size="auto"
      overrides={modalOverrides}
    >
      <ModalBody>
        <Stack>
          <Heading>
            {screen === "providers"
              ? "Connect a library"
              : existing
                ? "Edit connection"
                : provider.title}
          </Heading>
          {screen === "providers" && (
            <>
              <Note>
                Bring your collection to Rocksky. Listen through the same player,
                wherever your music lives.
              </Note>
              {libraryProviders.map((p) => (
                <Row key={p.kind} type="button" disabled={busy} onClick={() => connect(p.kind)}>
                  <LibraryLogo kind={p.kind} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <Name>{p.title}</Name>
                    <Note>{p.hint}</Note>
                  </span>
                  <IconChevronRight size={18} color="var(--color-text-muted)" />
                </Row>
              ))}
            </>
          )}
          {screen === "connect" && (
            <form
              onSubmit={handleSubmit(save)}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <LibraryLogo kind={config.kind} size={56} />
                <div>
                  <Name>{provider.title}</Name>
                  <Note>{provider.hint}</Note>
                </div>
              </div>
              {config.kind === "upnp" && (
                <>
                  <Secondary type="button" disabled={busy} onClick={() => void discover()}>
                    <IconRadar size={18} />
                    {scanning ? "Scanning network…" : "Scan this network"}
                  </Secondary>
                  {devices.map((device) => (
                    <Row
                      key={device.baseUrl}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setValue("baseUrl", device.baseUrl, { shouldValidate: true, shouldDirty: true });
                        setValue("name", device.name, { shouldValidate: true, shouldDirty: true });
                      }}
                    >
                      <LibraryLogo kind="upnp" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <Name>{device.name}</Name>
                        <Note style={{ wordBreak: "break-all" }}>{device.baseUrl}</Note>
                      </span>
                    </Row>
                  ))}
                  {searched && !devices.length && (
                    <Note>
                      No servers found. Check that you’re on the same network, or
                      enter a device description URL below.
                    </Note>
                  )}
                </>
              )}
              {field("Library name", "name", provider.title)}
              {field(
                config.kind === "upnp" ? "Device description URL" : "Server URL",
                "baseUrl",
                provider.placeholder,
              )}
              {config.kind !== "upnp" && (
                <>
                  {field("Username", "username", "Username")}
                  {field(
                    "Password",
                    "password",
                    existing ? "Leave blank to keep current password" : "Password",
                    true,
                  )}
                </>
              )}
              <Note>
                Credentials are stored on this computer. Use HTTPS when
                connecting over the internet.
              </Note>
              <Primary type="submit" disabled={busy}>
                {busy && !scanning ? "Connecting…" : "Connect library"}
              </Primary>
            </form>
          )}
          {error && <ErrorText role="alert">{error}</ErrorText>}
        </Stack>
      </ModalBody>
    </Modal>
  );
}
