import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@styled-icons/evaicons-solid";
import { Copy, Trash } from "@styled-icons/ionicons-outline";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "baseui/modal";
import { Textarea } from "baseui/textarea";
import copy from "copy-to-clipboard";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import z from "zod";
import {
  useApikeysQuery,
  useCreateApikeyMutation,
  useDeleteApikeyMutation,
  useUpdateApikeyMutation,
} from "../../hooks/useApikey";
import Main from "../../layouts/Main";
import { ApiKey } from "../../types/apikey";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

const inputOverrides = {
  Root: {
    style: {
      backgroundColor: "var(--color-input-background)",
      borderColor: "var(--color-input-background)",
    },
  },
  InputContainer: {
    style: {
      backgroundColor: "var(--color-input-background)",
    },
  },
  Input: {
    style: {
      color: "var(--color-text)",
      caretColor: "var(--color-text)",
    },
  },
};

function ApiKeyRow({ row, onEnable, onDisable, onDelete }: {
  row: ApiKey;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [localEnabled, setLocalEnabled] = useState(row.enabled);

  const handleDisable = () => {
    setLocalEnabled(false);
    onDisable(row.id);
  };

  const handleEnable = () => {
    setLocalEnabled(true);
    onEnable(row.id);
  };

  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
          {row.name}
        </span>
        <div className="flex items-center gap-2">
          <Button
            kind="secondary"
            size="mini"
            onClick={localEnabled ? handleDisable : handleEnable}
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: "var(--color-default-button)",
                  color: "var(--color-text)",
                  fontSize: "12px",
                  ":hover": {
                    backgroundColor: "var(--color-default-button) !important",
                    opacity: 0.8,
                  },
                },
              },
            }}
          >
            {localEnabled ? "Disable" : "Enable"}
          </Button>
          <button
            onClick={() => onDelete(row.id)}
            className="border-none bg-transparent cursor-pointer p-1"
          >
            <Trash size={18} color="var(--color-text)" />
          </button>
        </div>
      </div>

      {row.description && (
        <p className="text-sm mb-3 m-0" style={{ color: "var(--color-text-muted)" }}>
          {row.description}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div>
          <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            API Key
          </span>
          <div className="flex items-center gap-2 mt-1">
            <code
              className="text-xs rounded px-2 py-1 flex-1 truncate"
              style={{ backgroundColor: "#000", color: "#fff" }}
            >
              {row.apiKey}
            </code>
            <button
              onClick={() => copy(row.apiKey)}
              className="border-none bg-transparent cursor-pointer p-1 shrink-0"
            >
              <Copy size={16} color="var(--color-text)" />
            </button>
          </div>
        </div>

        <div>
          <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Shared Secret
          </span>
          <div className="flex items-center gap-2 mt-1">
            <code
              className="text-xs rounded px-2 py-1 flex-1 truncate"
              style={{ backgroundColor: "#000", color: "#fff" }}
            >
              {row.sharedSecret}
            </code>
            <button
              onClick={() => copy(row.sharedSecret)}
              className="border-none bg-transparent cursor-pointer p-1 shrink-0"
            >
              <Copy size={16} color="var(--color-text)" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const navigate = useNavigate();
  const jwt = localStorage.getItem("token");
  const [isOpen, setIsOpen] = useState(false);

  const {
    control,
    formState: { errors },
    clearErrors,
    reset,
    getValues,
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onBlur",
  });

  let apiKeys = useApikeysQuery();
  const { mutate: createApiKey } = useCreateApikeyMutation();
  const { mutate: updateApiKey } = useUpdateApikeyMutation();
  const { mutate: deleteApiKey } = useDeleteApikeyMutation();

  if (!jwt) {
    navigate("/");
    return null;
  }

  const onCreate = async () => {
    if (errors.name) return;
    const values = getValues();
    createApiKey(
      { name: values.name, description: values.description },
      {
        onSuccess: async () => {
          apiKeys = await apiKeys.refetch();
          setIsOpen(false);
          clearErrors();
          reset();
        },
      },
    );
  };

  const onDisable = (id: string) => {
    updateApiKey({ id, enabled: false }, { onSuccess: () => apiKeys.refetch() });
  };

  const onEnable = (id: string) => {
    updateApiKey({ id, enabled: true }, { onSuccess: () => apiKeys.refetch() });
  };

  const onDelete = (id: string) => {
    deleteApiKey(id, { onSuccess: () => apiKeys.refetch() });
  };

  return (
    <Main>
      <div className="px-4 pt-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold m-0" style={{ color: "var(--color-text)" }}>
            API Applications
          </h2>
          <Button
            startEnhancer={() => <Plus size={20} style={{ color: "white" }} />}
            onClick={() => setIsOpen(true)}
            size="compact"
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: "var(--color-primary)",
                  ":hover": { backgroundColor: "var(--color-primary)", opacity: 0.8 },
                  ":focus": { backgroundColor: "var(--color-primary)", opacity: 0.8 },
                },
              },
            }}
          >
            New API Key
          </Button>
        </div>

        {apiKeys.data?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl opacity-20">🔑</span>
            <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
              No API keys yet. Create one to get started.
            </p>
          </div>
        )}

        {apiKeys.data?.map((row: ApiKey) => (
          <ApiKeyRow
            key={row.id}
            row={row}
            onEnable={onEnable}
            onDisable={onDisable}
            onDelete={onDelete}
          />
        ))}
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        overrides={{
          Root: { style: { zIndex: 50 } },
          Dialog: { style: { backgroundColor: "var(--color-background)" } },
          Close: {
            style: {
              color: "var(--color-text)",
              ":hover": { color: "var(--color-text)", opacity: 0.8 },
            },
          },
        }}
      >
        <ModalHeader className="!text-[var(--color-text)]">Create a new API key</ModalHeader>
        <ModalBody>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                placeholder="Name"
                clearOnEscape
                error={!!errors.name}
                overrides={inputOverrides}
              />
            )}
          />
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                placeholder="Description (Optional)"
                clearOnEscape
                overrides={{
                  ...inputOverrides,
                  Root: {
                    style: {
                      ...inputOverrides.Root.style,
                      marginTop: "20px",
                    },
                  },
                }}
              />
            )}
          />
        </ModalBody>
        <ModalFooter>
          <Button
            kind="tertiary"
            onClick={() => setIsOpen(false)}
            overrides={{
              BaseButton: {
                style: {
                  marginRight: "10px",
                  backgroundColor: "var(--color-background) !important",
                  color: "var(--color-text) !important",
                  ":hover": { backgroundColor: "var(--color-background)" },
                },
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={onCreate}
            shape="pill"
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: "var(--color-purple) !important",
                  color: "var(--color-button-text) !important",
                  ":hover": {
                    backgroundColor: "var(--color-purple)",
                    color: "var(--color-button-text) !important",
                  },
                },
              },
            }}
          >
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </Main>
  );
}
