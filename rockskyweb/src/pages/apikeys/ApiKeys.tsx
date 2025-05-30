import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@styled-icons/evaicons-solid";
import { Copy, Trash } from "@styled-icons/ionicons-outline";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "baseui/modal";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { Textarea } from "baseui/textarea";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingMedium } from "baseui/typography";
import copy from "copy-to-clipboard";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import z from "zod";
import {
  useApikeysQuery,
  useCreateApikeyMutation,
  useDeleteApikeyMutation,
  useUpdateApikeyMutation,
} from "../../hooks/useApikey";
import Main from "../../layouts/Main";
import { ApiKey } from "../../types/apikey";
import { Code, Header } from "./styles";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

function ApiKeys() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const jwt = localStorage.getItem("token");
  const [enabled, setEnabled] = useState<{
    [key: string]: boolean;
  }>({});
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
  const { mutate: createApiKey } = useCreateApikeyMutation();
  let apiKeys = useApikeysQuery();
  const { mutate: updateApiKey } = useUpdateApikeyMutation();
  const { mutate: deleteApiKey } = useDeleteApikeyMutation();

  const onCreate = async () => {
    if (errors.name) {
      return;
    }

    const values = getValues();

    await createApiKey({ name: values.name, description: values.description });

    setIsOpen(false);
    clearErrors();
    reset();

    apiKeys = await apiKeys.refetch();
  };

  const onDisable = async (id: string) => {
    setEnabled((prev) => ({
      ...prev,
      [id]: false,
    }));
    await updateApiKey({ id, enabled: false });
    apiKeys = await apiKeys.refetch();
  };

  const onEnable = async (id: string) => {
    setEnabled((prev) => ({
      ...prev,
      [id]: true,
    }));
    await updateApiKey({ id, enabled: true });
    apiKeys = await apiKeys.refetch();
  };

  const onDelete = async (id: string) => {
    await deleteApiKey(id);
    apiKeys = await apiKeys.refetch();
  };

  if (!jwt) {
    navigate("/");
  }

  return (
    <Main withRightPane={false}>
      <div className="mt-[70px] mb-[150px]">
        <Header>
          <HeadingMedium
            marginTop={"0px"}
            marginBottom={"20px"}
            className="!text-[var(--color-text)]"
          >
            API Applications
          </HeadingMedium>
          <Button
            startEnhancer={() => (
              <Plus
                size={24}
                style={{
                  color: "white",
                }}
              />
            )}
            onClick={() => {
              setIsOpen(true);
            }}
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
            New API Key
          </Button>
        </Header>
        <TableBuilder
          data={apiKeys.data}
          emptyMessage="No API keys found"
          overrides={{
            TableBody: {
              style: {
                backgroundColor: "var(--color-background)",
              },
            },
            TableHeadRow: {
              style: {
                backgroundColor: "var(--color-background)",
              },
            },
            Table: {
              style: {
                backgroundColor: "var(--color-background)",
              },
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
            {(row: ApiKey) => (
              <div className="flex flex-row items-center">{row.name}</div>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn
            header="Keys"
            overrides={{
              TableBodyCell: {
                style: {
                  width: "300px",
                },
              },
            }}
          >
            {(row: ApiKey) => (
              <div className="w-[300px]">
                <div>API Key:</div>
                <Code>{row.apiKey}</Code>
                <StatefulTooltip content="Copy API Key">
                  <Copy
                    onClick={() => copy(row.apiKey)}
                    size={18}
                    color="var(--color-text)"
                    className="ml-[5px] cursor-pointer"
                  />
                </StatefulTooltip>
                <div style={{ marginTop: "5px" }}>Shared Secret:</div>
                <Code>{row.sharedSecret}</Code>
                <StatefulTooltip content="Copy Shared Secret">
                  <Copy
                    onClick={() => copy(row.sharedSecret)}
                    size={18}
                    color="var(--color-text)"
                    className="ml-[5px] cursor-pointer"
                  />
                </StatefulTooltip>
              </div>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn header="Description">
            {(row: ApiKey) => <div>{row.description}</div>}
          </TableBuilderColumn>
          <TableBuilderColumn
            header="Action"
            overrides={{
              TableBodyCell: {
                style: {
                  width: "150px",
                },
              },
            }}
          >
            {(row: ApiKey) => (
              <div className="w-[150px]">
                {(enabled[row.id] || row.enabled) && (
                  <Button
                    kind="secondary"
                    onClick={() => onDisable(row.id)}
                    overrides={{
                      BaseButton: {
                        style: {
                          backgroundColor: "var(--color-default-button)",
                          color: "var(--color-text)",
                          ":hover": {
                            backgroundColor:
                              "var(--color-default-button) !important",
                            opacity: 0.8,
                          },
                        },
                      },
                    }}
                  >
                    Disable
                  </Button>
                )}
                {!enabled[row.id] && !row.enabled && (
                  <Button
                    kind="secondary"
                    onClick={() => onEnable(row.id)}
                    overrides={{
                      BaseButton: {
                        style: {
                          backgroundColor: "var(--color-default-button)",
                          color: "var(--color-text)",
                          ":hover": {
                            backgroundColor:
                              "var(--color-default-button) !important",
                            opacity: 0.8,
                          },
                        },
                      },
                    }}
                  >
                    Enable
                  </Button>
                )}
                <Trash
                  onClick={() => onDelete(row.id)}
                  size={20}
                  color="var(--color-text)"
                  className="ml-[10px] mt-[-3px] cursor-pointer"
                />
              </div>
            )}
          </TableBuilderColumn>
        </TableBuilder>
      </div>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        overrides={{
          Root: {
            style: {
              zIndex: 1,
            },
          },
        }}
      >
        <ModalHeader>Create a new API key</ModalHeader>
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
                error={!!errors.description}
                overrides={{
                  Root: {
                    style: {
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
                },
              },
            }}
          >
            Cancel
          </Button>
          <Button onClick={onCreate}>Create</Button>
        </ModalFooter>
      </Modal>
    </Main>
  );
}

export default ApiKeys;
