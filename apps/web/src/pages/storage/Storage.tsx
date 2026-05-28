import { IconCloud, IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "baseui/button";
import { FormControl } from "baseui/form-control";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "baseui/modal";
import { LabelMedium, LabelSmall } from "baseui/typography";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  StorageProvider,
  createStorageProvider,
  deleteStorageProvider,
  getStorageProviders,
} from "../../api/storage";
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
};

interface FormValues {
  label: string;
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  public_url: string;
}

function ProviderRow({
  provider,
  onDelete,
}: {
  provider: StorageProvider;
  onDelete: (id: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        className="rounded-xl p-4 mb-3"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconCloud size={20} color="var(--color-primary)" className="shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-base m-0 truncate" style={{ color: "var(--color-text)" }}>
                {provider.label}
              </p>
              <p className="text-sm m-0 truncate" style={{ color: "var(--color-text-muted)" }}>
                {provider.endpoint} · {provider.bucket}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {provider.verified_at && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: "#14532d33", color: "#4ade80" }}
              >
                Verified
              </span>
            )}
            <button
              onClick={() => setConfirmOpen(true)}
              className="border-none bg-transparent cursor-pointer p-1"
            >
              <IconTrash size={18} color="var(--color-text-muted)" />
            </button>
          </div>
        </div>

        {provider.public_url && (
          <p className="text-xs mt-2 mb-0" style={{ color: "var(--color-text-muted)" }}>
            CDN: {provider.public_url}
          </p>
        )}
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        overrides={{
          Root: { style: { zIndex: 50 } },
          Dialog: { style: { backgroundColor: "var(--color-background)" } },
          Close: { style: { color: "var(--color-text)" } },
        }}
      >
        <ModalHeader className="!text-[var(--color-text)]">Remove storage provider?</ModalHeader>
        <ModalBody>
          <LabelMedium className="!text-[var(--color-text-muted)]">
            This will only remove the connection. Files already uploaded to{" "}
            <strong style={{ color: "var(--color-text)" }}>{provider.bucket}</strong> are not deleted.
          </LabelMedium>
        </ModalBody>
        <ModalFooter>
          <Button
            kind="tertiary"
            onClick={() => setConfirmOpen(false)}
            overrides={{
              BaseButton: {
                style: {
                  marginRight: "10px",
                  backgroundColor: "var(--color-background) !important",
                  color: "var(--color-text) !important",
                },
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => { onDelete(provider.id); setConfirmOpen(false); }}
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: "#dc2626 !important",
                  color: "#fff !important",
                },
              },
            }}
          >
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default function StoragePage() {
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jwt = localStorage.getItem("token");

  const [isOpen, setIsOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { region: "auto" },
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["storage-providers"],
    queryFn: getStorageProviders,
    enabled: !!jwt,
  });

  const createMutation = useMutation({
    mutationFn: createStorageProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-providers"] });
      setIsOpen(false);
      setApiError(null);
      reset();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to connect. Check your credentials and try again.";
      setApiError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStorageProvider,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["storage-providers"] }),
  });

  if (!jwt || !profile) {
    navigate({ to: "/" });
    return null;
  }

  const onSubmit = (values: FormValues) => {
    setApiError(null);
    createMutation.mutate({
      label: values.label,
      endpoint: values.endpoint,
      region: values.region || "auto",
      bucket: values.bucket,
      access_key: values.access_key,
      secret_key: values.secret_key,
      public_url: values.public_url || undefined,
    });
  };

  return (
    <Main>
      <div className="px-4 pt-4 pb-24 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold m-0" style={{ color: "var(--color-text)" }}>
            Storage
          </h2>
          <Button
            startEnhancer={() => <IconPlus size={18} color="#fff" />}
            onClick={() => { setApiError(null); setIsOpen(true); }}
            size="compact"
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: "var(--color-primary)",
                  ":hover": { backgroundColor: "var(--color-primary)", opacity: 0.8 },
                },
              },
            }}
          >
            Connect storage
          </Button>
        </div>

        <div
          className="rounded-xl p-4 mb-4 flex items-start gap-3"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <IconLock size={18} color="var(--color-text-muted)" className="shrink-0 mt-0.5" />
          <LabelSmall className="!text-[var(--color-text-muted)] m-0">
            Your access key and secret key are encrypted at rest using XSalsa20-Poly1305 before being stored. They are never returned by the API.
          </LabelSmall>
        </div>

        {providers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <IconCloud size={48} color="var(--color-text-muted)" strokeWidth={1.2} />
            <p className="text-sm text-center m-0" style={{ color: "var(--color-text-muted)" }}>
              No storage providers connected yet.
              <br />
              Uploads will use Rocksky's managed storage.
            </p>
          </div>
        )}

        {providers.map((p) => (
          <ProviderRow key={p.id} provider={p} onDelete={(id) => deleteMutation.mutate(id)} />
        ))}
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => { setIsOpen(false); setApiError(null); reset(); }}
        overrides={{
          Root: { style: { zIndex: 50 } },
          Dialog: { style: { backgroundColor: "var(--color-background)" } },
          Close: { style: { color: "var(--color-text)", ":hover": { color: "var(--color-text)", opacity: 0.8 } } },
        }}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader className="!text-[var(--color-text)]">Connect S3 storage</ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-3">
              <FormControl label="Label" error={errors.label?.message}>
                <Controller
                  name="label"
                  control={control}
                  rules={{ required: "Required" }}
                  render={({ field }) => (
                    <Input {...field} placeholder="e.g. My Cloudflare R2" overrides={inputOverrides} error={!!errors.label} />
                  )}
                />
              </FormControl>
              <FormControl label="S3 Endpoint" error={errors.endpoint?.message}>
                <Controller
                  name="endpoint"
                  control={control}
                  rules={{ required: "Required" }}
                  render={({ field }) => (
                    <Input {...field} placeholder="https://…" overrides={inputOverrides} error={!!errors.endpoint} />
                  )}
                />
              </FormControl>
              <div className="grid grid-cols-2 gap-3">
                <FormControl label="Region" caption="Default: auto">
                  <Controller
                    name="region"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} placeholder="auto" overrides={inputOverrides} />
                    )}
                  />
                </FormControl>
                <FormControl label="Bucket" error={errors.bucket?.message}>
                  <Controller
                    name="bucket"
                    control={control}
                    rules={{ required: "Required" }}
                    render={({ field }) => (
                      <Input {...field} placeholder="my-bucket" overrides={inputOverrides} error={!!errors.bucket} />
                    )}
                  />
                </FormControl>
              </div>
              <FormControl label="Access Key ID" error={errors.access_key?.message}>
                <Controller
                  name="access_key"
                  control={control}
                  rules={{ required: "Required" }}
                  render={({ field }) => (
                    <Input {...field} placeholder="Access key ID" overrides={inputOverrides} error={!!errors.access_key} />
                  )}
                />
              </FormControl>
              <FormControl
                label="Secret Access Key"
                error={errors.secret_key?.message}
                caption="Encrypted at rest — never stored in plaintext"
              >
                <Controller
                  name="secret_key"
                  control={control}
                  rules={{ required: "Required" }}
                  render={({ field }) => (
                    <Input {...field} type="password" placeholder="Secret access key" overrides={inputOverrides} error={!!errors.secret_key} />
                  )}
                />
              </FormControl>
              <FormControl
                label="Public CDN URL"
                caption="Optional — e.g. https://cdn.example.com. If set, audio streams directly from your CDN. If omitted, Rocksky generates presigned URLs."
              >
                <Controller
                  name="public_url"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} placeholder="https://cdn.example.com" overrides={inputOverrides} />
                  )}
                />
              </FormControl>

              {apiError && (
                <p className="text-sm m-0" style={{ color: "#ef4444" }}>
                  {apiError}
                </p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              kind="tertiary"
              type="button"
              onClick={() => { setIsOpen(false); setApiError(null); reset(); }}
              overrides={{
                BaseButton: {
                  style: {
                    marginRight: "10px",
                    backgroundColor: "var(--color-background) !important",
                    color: "var(--color-text) !important",
                  },
                },
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting || createMutation.isPending}
              shape="pill"
              overrides={{
                BaseButton: {
                  style: {
                    backgroundColor: "var(--color-primary) !important",
                    color: "#fff !important",
                  },
                },
              }}
            >
              Connect & verify
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </Main>
  );
}
