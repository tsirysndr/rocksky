import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@styled-icons/evaicons-solid";
import { Copy, Trash } from "@styled-icons/ionicons-outline";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "baseui/modal";
import copy from "copy-to-clipboard";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import z from "zod";
import {
  useAccessTokensQuery,
  useCreateAccessTokenMutation,
  useDeleteAccessTokenMutation,
} from "../../hooks/useAccessToken";
import Main from "../../layouts/Main";
import { AccessToken, CreatedAccessToken } from "../../types/access-token";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

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
    style: {
      color: "var(--color-text)",
      caretColor: "var(--color-text)",
    },
  },
};

function TokenRow({
  row,
  onDelete,
}: {
  row: AccessToken;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-semibold text-base"
          style={{ color: "var(--color-text)" }}
        >
          {row.name}
        </span>
        <button
          onClick={() => onDelete(row.id)}
          className="border-none bg-transparent cursor-pointer p-1"
        >
          <Trash size={18} color="var(--color-text)" />
        </button>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <div
          className="font-mono"
          style={{ color: "var(--color-text-muted)" }}
        >
          ••••{row.lastFour}
        </div>
        <div style={{ color: "var(--color-text-muted)" }}>
          Created {new Date(row.createdAt).toLocaleString()}
        </div>
        {row.lastUsedAt && (
          <div style={{ color: "var(--color-text-muted)" }}>
            Last used {new Date(row.lastUsedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccessTokensPage() {
  const navigate = useNavigate();
  const jwt = localStorage.getItem("token");
  const [isOpen, setIsOpen] = useState(false);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);

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

  let tokens = useAccessTokensQuery();
  const { mutate: createToken } = useCreateAccessTokenMutation();
  const { mutate: deleteToken } = useDeleteAccessTokenMutation();

  if (!jwt) {
    navigate("/");
    return null;
  }

  const onCreate = async () => {
    if (errors.name) return;
    const values = getValues();
    createToken(
      { name: values.name },
      {
        onSuccess: async (res) => {
          tokens = await tokens.refetch();
          setCreated(res.data);
          setIsOpen(false);
          clearErrors();
          reset();
        },
      },
    );
  };

  const onDelete = (id: string) => {
    deleteToken(id, { onSuccess: () => tokens.refetch() });
  };

  return (
    <Main>
      <div className="px-4 pt-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-xl font-bold m-0"
            style={{ color: "var(--color-text)" }}
          >
            Access Tokens
          </h2>
          <Button
            startEnhancer={() => <Plus size={20} style={{ color: "white" }} />}
            onClick={() => setIsOpen(true)}
            size="compact"
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: "var(--color-primary)",
                  ":hover": {
                    backgroundColor: "var(--color-primary)",
                    opacity: 0.8,
                  },
                  ":focus": {
                    backgroundColor: "var(--color-primary)",
                    opacity: 0.8,
                  },
                },
              },
            }}
          >
            New Token
          </Button>
        </div>

        <p
          className="text-xs mb-4 m-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          Use as <code>Authorization: Bearer …</code>. The full secret is only
          shown once at creation.
        </p>

        {tokens.data?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl opacity-20">🔐</span>
            <p
              className="text-sm text-center"
              style={{ color: "var(--color-text-muted)" }}
            >
              No access tokens yet.
            </p>
          </div>
        )}

        {tokens.data?.map((row: AccessToken) => (
          <TokenRow key={row.id} row={row} onDelete={onDelete} />
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
        <ModalHeader className="!text-[var(--color-text)]">
          New access token
        </ModalHeader>
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

      <Modal
        isOpen={!!created}
        onClose={() => setCreated(null)}
        closeable
        overrides={{
          Root: { style: { zIndex: 60 } },
          Dialog: { style: { backgroundColor: "var(--color-background)" } },
          Close: {
            style: {
              color: "var(--color-text)",
              ":hover": { color: "var(--color-text)", opacity: 0.8 },
            },
          },
        }}
      >
        <ModalHeader className="!text-[var(--color-text)]">
          Copy your access token
        </ModalHeader>
        <ModalBody>
          <p
            className="text-sm m-0 mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            This token will not be shown again.
          </p>
          {created && (
            <div className="flex items-center gap-2">
              <code
                className="text-xs rounded px-2 py-1 flex-1 break-all"
                style={{ backgroundColor: "#000", color: "#fff" }}
              >
                {created.token}
              </code>
              <button
                onClick={() => copy(created.token)}
                className="border-none bg-transparent cursor-pointer p-1 shrink-0"
              >
                <Copy size={18} color="var(--color-text)" />
              </button>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => setCreated(null)}
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
            Done
          </Button>
        </ModalFooter>
      </Modal>
    </Main>
  );
}
