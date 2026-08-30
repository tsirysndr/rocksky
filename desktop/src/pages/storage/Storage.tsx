// Bring-your-own S3 storage.
//
// Connecting a provider here is what makes "Your storage" selectable on the
// upload page. Everything is additive to the managed default: a user with no
// provider uploads exactly as before, and nothing on this page can change
// where existing files live — the server refuses to delete a provider that
// uploads still reference.
//
// The API verifies the bucket (HeadBucket with the given credentials) before
// persisting anything, so a listed provider is one that worked at least once.

import styled from "@emotion/styled";
import {
  IconCloud,
  IconLock,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  StorageProvider,
  createStorageProvider,
  deleteStorageProvider,
  getStorageProviders,
} from "../../api/storage";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Styled components — same idiom as the library and upload pages.
// ---------------------------------------------------------------------------

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const PageSubtitle = styled.p`
  margin: 0 0 24px;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

const SecurityNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0 0 24px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--color-menu-hover);
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  line-height: 1.6;

  svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* The header action, styled like the library's "Upload Music" button —
   quiet at rest, primary-tinted on hover — rather than a solid primary slab. */
const HeaderButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 12px;
  border: none;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }
`;

const GhostButton = styled.button`
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }
`;

const DangerButton = styled(PrimaryButton)`
  background: #e55;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 72px 0;
  color: var(--color-text-muted);
`;

const EmptyTitle = styled.p`
  margin: 0;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const EmptySubtitle = styled.p`
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.6;
`;

const ProviderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ProviderCard = styled.div`
  border-radius: 12px;
  padding: 16px;
  background: var(--color-menu-hover);
`;

const ProviderTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const ProviderIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const ProviderInfo = styled.div`
  min-width: 0;
`;

const ProviderLabel = styled.p`
  margin: 0;
  font-size: 0.9375rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ProviderMeta = styled.p`
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ProviderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const VerifiedBadge = styled.span`
  font-size: 0.6875rem;
  padding: 2px 10px;
  border-radius: 999px;
  font-family: RockfordSansMedium;
  color: #4caf50;
  background: color-mix(in srgb, #4caf50 12%, transparent);
`;

const IconButton = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  color: var(--color-text-muted);
  display: flex;

  &:hover {
    background: var(--color-background);
    color: #e55;
  }
`;

// ---------------------------------------------------------------------------
// Dialog — the app's own overlay/panel, not baseui's Modal.
// ---------------------------------------------------------------------------

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.55);
`;

const Panel = styled.div`
  &,
  & *,
  & *::before,
  & *::after {
    box-sizing: border-box;
  }
  width: 460px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  border-radius: 16px;
  background: var(--color-background);
  border: 1px solid var(--color-menu-hover);
  padding: 24px;
`;

const FormPanel = styled(Panel)`
  /* Wide enough that two columns of URL-ish fields don't feel cramped; the
     base panel's max-width still caps it on small windows. */
  width: 640px;
`;

/* Two columns keeps the seven fields to four rows; long URLs span both. */
const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 12px;
`;

const SpanBoth = styled.div`
  grid-column: 1 / -1;
`;

const DialogTitle = styled.h2`
  margin: 0 0 4px;
  font-size: 1.125rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const DialogSubtitle = styled.p`
  margin: 0 0 20px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  line-height: 1.6;
`;

const Field = styled.div`
  margin-bottom: 14px;
`;

const FieldLabel = styled.label`
  display: block;
  margin-bottom: 6px;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const FieldInput = styled.input<{ invalid?: boolean }>`
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid
    ${({ invalid }) => (invalid ? "#e55" : "var(--color-menu-hover)")};
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;

  &::placeholder {
    color: var(--color-text-muted);
  }
  &:focus {
    outline: none;
    border-color: ${({ invalid }) => (invalid ? "#e55" : "var(--color-primary)")};
  }
`;

const FieldHint = styled.p`
  margin: 5px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.5;
`;

const FieldError = styled.p`
  margin: 5px 0 0;
  font-size: 0.75rem;
  color: #e55;
`;

const ApiError = styled.div`
  margin: 4px 0 14px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #e55;
  background: color-mix(in srgb, #e55 10%, transparent);
  overflow-wrap: anywhere;
`;

const DialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

const ConfirmText = styled.p`
  margin: 0 0 20px;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  line-height: 1.6;

  strong {
    color: var(--color-text);
  }
`;

// ---------------------------------------------------------------------------
// Connect dialog
// ---------------------------------------------------------------------------

type FormValues = {
  label: string;
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  public_url: string;
};

const URL_RULE = {
  value: /^https?:\/\//i,
  message: "Must be a URL, e.g. https://…",
};

export function ConnectStorageDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  /** Called with the new provider once the server has verified the bucket. */
  onConnected?: (provider: StorageProvider) => void;
}) {
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      label: "",
      endpoint: "",
      region: "auto",
      bucket: "",
      access_key: "",
      secret_key: "",
      public_url: "",
    },
  });

  const create = useMutation({
    mutationFn: createStorageProvider,
    onSuccess: (provider) => {
      queryClient.invalidateQueries({ queryKey: ["storage-providers"] });
      onConnected?.(provider);
      onClose();
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { message?: string } } })
        ?.response?.data;
      setApiError(
        data?.message && data.message !== "UnknownError"
          ? data.message
          : "Could not reach that bucket with these credentials. Check the endpoint, bucket name and keys, then try again.",
      );
    },
  });

  const submit = handleSubmit((values) => {
    setApiError(null);
    create.mutate({
      label: values.label.trim(),
      endpoint: values.endpoint.trim(),
      region: values.region.trim() || "auto",
      bucket: values.bucket.trim(),
      access_key: values.access_key.trim(),
      secret_key: values.secret_key.trim(),
      public_url: values.public_url.trim() || undefined,
    });
  });

  // Esc closes, matching the app's other dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Overlay onMouseDown={onClose}>
      <FormPanel onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <DialogTitle>Connect your storage</DialogTitle>
          <DialogSubtitle>
            Any S3-compatible service works — Cloudflare R2, Backblaze B2,
            MinIO, AWS S3, … The bucket is checked with these credentials
            before anything is saved.
          </DialogSubtitle>

          <FormGrid>
            <Field>
              <FieldLabel htmlFor="st-label">Name</FieldLabel>
              <FieldInput
                id="st-label"
                placeholder="e.g. My Cloudflare R2"
                invalid={!!errors.label}
                autoFocus
                {...register("label", { required: "Give this storage a name" })}
              />
              {errors.label && <FieldError>{errors.label.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="st-bucket">Bucket</FieldLabel>
              <FieldInput
                id="st-bucket"
                placeholder="my-music"
                invalid={!!errors.bucket}
                spellCheck={false}
                {...register("bucket", { required: "The bucket name is required" })}
              />
              {errors.bucket && <FieldError>{errors.bucket.message}</FieldError>}
            </Field>

            <SpanBoth>
              <Field>
                <FieldLabel htmlFor="st-endpoint">S3 endpoint</FieldLabel>
                <FieldInput
                  id="st-endpoint"
                  placeholder="https://<account>.r2.cloudflarestorage.com"
                  invalid={!!errors.endpoint}
                  spellCheck={false}
                  {...register("endpoint", {
                    required: "The S3 endpoint is required",
                    pattern: URL_RULE,
                  })}
                />
                {errors.endpoint && (
                  <FieldError>{errors.endpoint.message}</FieldError>
                )}
              </Field>
            </SpanBoth>

            <Field>
              <FieldLabel htmlFor="st-access">Access key ID</FieldLabel>
              <FieldInput
                id="st-access"
                invalid={!!errors.access_key}
                spellCheck={false}
                autoComplete="off"
                {...register("access_key", { required: "Required" })}
              />
              {errors.access_key && (
                <FieldError>{errors.access_key.message}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="st-secret">Secret access key</FieldLabel>
              <FieldInput
                id="st-secret"
                type="password"
                invalid={!!errors.secret_key}
                autoComplete="off"
                {...register("secret_key", { required: "Required" })}
              />
              {errors.secret_key ? (
                <FieldError>{errors.secret_key.message}</FieldError>
              ) : (
                <FieldHint>Encrypted at rest, never returned.</FieldHint>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="st-region">Region</FieldLabel>
              <FieldInput
                id="st-region"
                placeholder="auto"
                spellCheck={false}
                {...register("region")}
              />
              <FieldHint>Most services accept "auto".</FieldHint>
            </Field>

            <Field>
              <FieldLabel htmlFor="st-cdn">Public CDN URL (optional)</FieldLabel>
              <FieldInput
                id="st-cdn"
                placeholder="https://cdn.example.com"
                invalid={!!errors.public_url}
                spellCheck={false}
                {...register("public_url", {
                  validate: (v) =>
                    !v.trim() ||
                    URL_RULE.value.test(v.trim()) ||
                    URL_RULE.message,
                })}
              />
              {errors.public_url ? (
                <FieldError>{errors.public_url.message}</FieldError>
              ) : (
                <FieldHint>
                  If set, audio streams straight from your CDN; otherwise
                  Rocksky serves presigned URLs.
                </FieldHint>
              )}
            </Field>
          </FormGrid>

          {apiError && <ApiError>{apiError}</ApiError>}

          <DialogActions>
            <GhostButton type="button" onClick={onClose}>
              Cancel
            </GhostButton>
            <PrimaryButton type="submit" disabled={create.isPending}>
              {create.isPending ? "Verifying bucket…" : "Connect & verify"}
            </PrimaryButton>
          </DialogActions>
        </form>
      </FormPanel>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

function DeleteDialog({
  provider,
  onClose,
}: {
  provider: StorageProvider;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => deleteStorageProvider(provider.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-providers"] });
      onClose();
    },
    onError: (err: unknown) => {
      const data = (err as {
        response?: { data?: { error?: string; message?: string } };
      })?.response?.data;
      setApiError(
        data?.error === "PROVIDER_IN_USE"
          ? "This storage still holds uploads, so it can't be disconnected — the files would become unplayable."
          : (data?.message ?? "Could not disconnect the storage."),
      );
    },
  });

  return (
    <Overlay onMouseDown={onClose}>
      <Panel onMouseDown={(e) => e.stopPropagation()}>
        <DialogTitle>Disconnect this storage?</DialogTitle>
        <ConfirmText>
          Rocksky forgets the connection to{" "}
          <strong>{provider.bucket}</strong>. Nothing in the bucket is deleted.
        </ConfirmText>
        {apiError && <ApiError>{apiError}</ApiError>}
        <DialogActions>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <DangerButton onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Disconnecting…" : "Disconnect"}
          </DangerButton>
        </DialogActions>
      </Panel>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StoragePage() {
  const navigate = useNavigate();
  const jwt = localStorage.getItem("token");

  const [connectOpen, setConnectOpen] = useState(false);
  const [deleting, setDeleting] = useState<StorageProvider | null>(null);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["storage-providers"],
    queryFn: getStorageProviders,
    enabled: !!jwt,
  });

  // Redirect home only when genuinely signed out — NOT when the profile is
  // still loading. The content only needs the token.
  useEffect(() => {
    if (!jwt) navigate({ to: "/" });
  }, [jwt, navigate]);

  if (!jwt) return null;

  return (
    <Main>
      <Page>
        <Header>
          <PageTitle>Storage</PageTitle>
          <HeaderButton onClick={() => setConnectOpen(true)}>
            <IconPlus size={15} /> Connect storage
          </HeaderButton>
        </Header>
        <PageSubtitle>
          Keep your uploads in your own S3-compatible bucket instead of
          Rocksky's managed storage.
        </PageSubtitle>

        <SecurityNote>
          <IconLock size={18} />
          <span>
            Access keys are encrypted at rest (XSalsa20-Poly1305) and never
            returned by the API. Rocksky only uses them to write and stream
            your own uploads.
          </span>
        </SecurityNote>

        {!isLoading && providers.length === 0 && (
          <EmptyState>
            <IconCloud size={48} color="var(--color-text-muted)" strokeWidth={1.2} />
            <div style={{ textAlign: "center" }}>
              <EmptyTitle>No storage connected</EmptyTitle>
              <EmptySubtitle>
                Uploads go to Rocksky's managed storage until you connect your
                own bucket.
              </EmptySubtitle>
            </div>
            <HeaderButton onClick={() => setConnectOpen(true)}>
              <IconPlus size={15} /> Connect your storage
            </HeaderButton>
          </EmptyState>
        )}

        {providers.length > 0 && (
          <ProviderList>
            {providers.map((p) => (
              <ProviderCard key={p.id}>
                <ProviderTop>
                  <ProviderIdentity>
                    <IconCloud size={20} color="var(--color-primary)" />
                    <ProviderInfo>
                      <ProviderLabel>{p.label}</ProviderLabel>
                      <ProviderMeta>
                        {p.endpoint} · {p.bucket}
                      </ProviderMeta>
                      {p.public_url && (
                        <ProviderMeta>CDN: {p.public_url}</ProviderMeta>
                      )}
                    </ProviderInfo>
                  </ProviderIdentity>
                  <ProviderActions>
                    {p.verified_at && <VerifiedBadge>Verified</VerifiedBadge>}
                    <IconButton
                      aria-label={`Disconnect ${p.label}`}
                      onClick={() => setDeleting(p)}
                    >
                      <IconTrash size={17} />
                    </IconButton>
                  </ProviderActions>
                </ProviderTop>
              </ProviderCard>
            ))}
          </ProviderList>
        )}
      </Page>

      {connectOpen && (
        <ConnectStorageDialog onClose={() => setConnectOpen(false)} />
      )}
      {deleting && (
        <DeleteDialog provider={deleting} onClose={() => setDeleting(null)} />
      )}
    </Main>
  );
}
