import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@styled-icons/evaicons-solid";
import { Copy, Trash } from "@styled-icons/ionicons-outline";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "baseui/modal";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingMedium, ParagraphSmall } from "baseui/typography";
import copy from "copy-to-clipboard";
import { useState } from "react";
import ContentLoader from "react-content-loader";
import { Controller, useForm } from "react-hook-form";
import z from "zod";
import {
  useAccessTokensQuery,
  useCreateAccessTokenMutation,
  useDeleteAccessTokenMutation,
} from "../../hooks/useAccessToken";
import Main from "../../layouts/Main";
import { AccessToken, CreatedAccessToken } from "../../types/access-token";
import { Code, Header } from "./styles";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

function AccessTokensSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ContentLoader
      speed={1.6}
      width="100%"
      height={rows * 70 + 40}
      viewBox={`0 0 1000 ${rows * 70 + 40}`}
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
    >
      <rect x="0" y="0" rx="3" ry="3" width="80" height="12" />
      <rect x="220" y="0" rx="3" ry="3" width="60" height="12" />
      <rect x="560" y="0" rx="3" ry="3" width="120" height="12" />
      <rect x="900" y="0" rx="3" ry="3" width="60" height="12" />
      {Array.from({ length: rows }).map((_, i) => {
        const y = 40 + i * 70;
        return (
          <g key={i}>
            <rect x="0" y={y + 20} rx="3" ry="3" width="140" height="14" />
            <rect x="220" y={y + 20} rx="4" ry="4" width="120" height="16" />
            <rect x="560" y={y + 20} rx="3" ry="3" width="240" height="12" />
            <circle cx="940" cy={y + 28} r="12" />
          </g>
        );
      })}
    </ContentLoader>
  );
}

function AccessTokens() {
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

  const { mutate: createToken } = useCreateAccessTokenMutation();
  const { mutate: deleteToken } = useDeleteAccessTokenMutation();
  let tokens = useAccessTokensQuery();

  if (!jwt) {
    navigate({ to: "/" });
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

  const onDelete = async (id: string) => {
    deleteToken(id, {
      onSuccess: async () => {
        tokens = await tokens.refetch();
      },
    });
  };

  return (
    <Main withRightPane={false}>
      <div className="mt-[70px] mb-[150px]">
        <Header>
          <HeadingMedium
            marginTop={"0px"}
            marginBottom={"20px"}
            className="!text-[var(--color-text)]"
          >
            Access Tokens
          </HeadingMedium>
          <Button
            startEnhancer={() => (
              <Plus size={24} style={{ color: "white" }} />
            )}
            onClick={() => setIsOpen(true)}
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
                  height: "50px",
                },
              },
            }}
          >
            New Access Token
          </Button>
        </Header>

        <ParagraphSmall
          marginTop={"0px"}
          marginBottom={"20px"}
          className="!text-[var(--color-text-muted)]"
        >
          Personal access tokens authenticate API requests in place of an
          interactive sign-in. Pass it as <Code>Authorization: Bearer …</Code>.
          The full secret is only shown once at creation — copy it somewhere
          safe.
        </ParagraphSmall>

        {tokens.isLoading && !tokens.data && <AccessTokensSkeleton />}

        <TableBuilder
          data={tokens.data}
          emptyMessage="No access tokens yet"
          overrides={{
            TableBody: {
              style: { backgroundColor: "var(--color-background)" },
            },
            TableHeadRow: {
              style: { backgroundColor: "var(--color-background)" },
            },
            Table: {
              style: { backgroundColor: "var(--color-background)" },
            },
            TableHeadCell: {
              style: {
                backgroundColor: "var(--color-background)",
                color: "var(--color-text)",
              },
            },
            TableBodyRow: {
              style: {
                backgroundColor: "var(--color-background)",
                ":hover": {
                  backgroundColor: "var(--color-menu-hover)",
                },
              },
            },
          }}
        >
          <TableBuilderColumn header="Name">
            {(row: AccessToken) => (
              <span className="text-[var(--color-text)]">{row.name}</span>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn header="Token">
            {(row: AccessToken) => (
              <span className="text-[var(--color-text-muted)] font-mono">
                ••••{row.lastFour}
              </span>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn header="Created">
            {(row: AccessToken) => (
              <span className="text-[var(--color-text-muted)]">
                {new Date(row.createdAt).toLocaleString()}
              </span>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn header="Last used">
            {(row: AccessToken) => (
              <span className="text-[var(--color-text-muted)]">
                {row.lastUsedAt
                  ? new Date(row.lastUsedAt).toLocaleString()
                  : "—"}
              </span>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn
            header="Action"
            overrides={{
              TableBodyCell: { style: { width: "80px" } },
            }}
          >
            {(row: AccessToken) => (
              <Trash
                onClick={() => onDelete(row.id)}
                size={20}
                color="var(--color-text)"
                className="cursor-pointer"
              />
            )}
          </TableBuilderColumn>
        </TableBuilder>
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
                placeholder="Name (e.g. CLI, my-laptop)"
                clearOnEscape
                error={!!errors.name}
                overrides={{
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
          <ParagraphSmall className="!text-[var(--color-text-muted)]">
            This token will not be shown again. Store it somewhere safe.
          </ParagraphSmall>
          {created && (
            <div className="flex items-center gap-2 mt-3">
              <Code>{created.token}</Code>
              <Copy
                onClick={() => copy(created.token)}
                size={20}
                color="var(--color-text)"
                className="cursor-pointer shrink-0"
              />
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

export default AccessTokens;
