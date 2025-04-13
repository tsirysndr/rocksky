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
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";
import useApikey from "../../hooks/useApikey";
import Main from "../../layouts/Main";
import { ApiKey } from "../../types/apikey";
import { Code, Header } from "./styles";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

function ApiKeys() {
  const [isOpen, setIsOpen] = useState(false);
  const [apikeys, setApikeys] = useState<ApiKey[]>([]);
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
  const { createApiKey, getApiKeys, updateApiKey, deleteApiKey } = useApikey();

  const fetchApiKeys = async () => {
    try {
      const response = await getApiKeys();
      setApikeys(response.data);
    } catch (error) {
      console.error("Error fetching API keys:", error);
    }
  };

  useEffect(() => {
    fetchApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async () => {
    if (errors.name) {
      return;
    }

    const values = getValues();

    await createApiKey(values.name, values.description);

    setIsOpen(false);
    clearErrors();
    reset();

    await fetchApiKeys();
  };

  const onDisable = async (id: string) => {
    setEnabled((prev) => ({
      ...prev,
      [id]: false,
    }));
    await updateApiKey(id, false);
    await fetchApiKeys();
  };

  const onEnable = async (id: string) => {
    setEnabled((prev) => ({
      ...prev,
      [id]: true,
    }));
    await updateApiKey(id, true);
    await fetchApiKeys();
  };

  const onDelete = async (id: string) => {
    await deleteApiKey(id);
    await fetchApiKeys();
  };

  return (
    <Main withRightPane={false}>
      <div
        style={{
          marginTop: 70,
          marginBottom: 150,
        }}
      >
        <Header>
          <HeadingMedium marginTop={"0px"} marginBottom={"20px"}>
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
                  backgroundColor: "rgb(255, 40, 118)",
                  ":hover": {
                    backgroundColor: "rgb(255, 40, 118)",
                    opacity: 0.8,
                  },
                  ":focus": {
                    backgroundColor: "rgb(255, 40, 118)",
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
        <TableBuilder data={apikeys} emptyMessage="No API keys found">
          <TableBuilderColumn header="Name">
            {(row: ApiKey) => (
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {row.name}
              </div>
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
              <div>
                <div>API Key:</div>
                <Code>{row.apiKey}</Code>
                <StatefulTooltip content="Copy API Key">
                  <Copy
                    onClick={() => copy(row.apiKey)}
                    size={18}
                    color="#000000a0"
                    style={{ marginLeft: 5, cursor: "pointer" }}
                  />
                </StatefulTooltip>
                <div style={{ marginTop: "5px" }}>Shared Secret:</div>
                <Code>{row.sharedSecret}</Code>
                <StatefulTooltip content="Copy Shared Secret">
                  <Copy
                    onClick={() => copy(row.sharedSecret)}
                    size={18}
                    color="#000000a0"
                    style={{ marginLeft: 5, cursor: "pointer" }}
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
              <div>
                {(enabled[row.id] || row.enabled) && (
                  <Button kind="secondary" onClick={() => onDisable(row.id)}>
                    Disable
                  </Button>
                )}
                {!enabled[row.id] && !row.enabled && (
                  <Button kind="secondary" onClick={() => onEnable(row.id)}>
                    Enable
                  </Button>
                )}
                <Trash
                  onClick={() => onDelete(row.id)}
                  size={20}
                  color="#000000a0"
                  style={{
                    marginLeft: 10,
                    marginTop: -3,
                    cursor: "pointer",
                  }}
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
