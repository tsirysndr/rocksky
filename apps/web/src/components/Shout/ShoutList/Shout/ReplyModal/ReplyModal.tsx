/* eslint-disable @typescript-eslint/no-explicit-any */
import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link as DefaultLink, useParams } from "@tanstack/react-router";
import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
} from "baseui/modal";
import { Spinner } from "baseui/spinner";
import { Textarea } from "baseui/textarea";
import { LabelMedium, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";
import { profileAtom } from "../../../../../atoms/profile";
import { shoutsAtom } from "../../../../../atoms/shouts";
import useShout from "../../../../../hooks/useShout";
import scrollToTop from "../../../../../lib/scrollToTop";

const ShoutSchema = z.object({
  message: z.string().min(1).max(1000),
});

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Message = styled.p`
  font-family: RockfordSansLight;
  margin-top: 3px;
  margin-bottom: 0px;
  width: 450px;
  font-size: 15px;
`;

interface ReplyModalProps {
  isOpen: boolean;
  close: () => void;
  shout: {
    uri: string;
    message: string;
    user: {
      avatar: string;
      displayName: string;
      handle: string;
    };
  };
}

function ReplyModal(props: ReplyModalProps) {
  const { isOpen, close, shout } = props;
  const { reply, getShouts } = useShout();
  const profile = useAtomValue(profileAtom);
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const { did, rkey } = useParams({ strict: false });
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, reset, watch } = useForm<
    z.infer<typeof ShoutSchema>
  >({
    mode: "onChange",
    resolver: zodResolver(ShoutSchema),
    defaultValues: {
      message: "",
    },
  });

  const onClose = () => {
    reset();
    close();
  };

  const onReply = async ({ message }: z.infer<typeof ShoutSchema>) => {
    setLoading(true);
    await reply(shout.uri, message);
    setLoading(false);
    reset();
    close();

    let uri = "";

    if (location.pathname.startsWith("/profile")) {
      uri = `at://${did}`;
    }

    if (location.pathname.includes("/scrobble/")) {
      uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    }

    if (location.pathname.includes("/song/")) {
      uri = `at://${did}/app.rocksky.song/${rkey}`;
    }

    if (location.pathname.includes("/album/")) {
      uri = `at://${did}/app.rocksky.album/${rkey}`;
    }

    if (location.pathname.includes("/artist/")) {
      uri = `at://${did}/app.rocksky.artist/${rkey}`;
    }

    const data = await getShouts(uri);
    setShouts({
      ...shouts,
      [location.pathname]: processShouts(data),
    });
  };

  const processShouts = (data: any) => {
    const mapShouts = (parentId: string | null) => {
      return data
        .filter((x: any) => x.shouts.parent === parentId)
        .map((x: any) => ({
          id: x.shouts.id,
          uri: x.shouts.uri,
          message: x.shouts.content,
          date: x.shouts.createdAt,
          liked: x.shouts.liked,
          reported: x.shouts.reported,
          likes: x.shouts.likes,
          user: {
            did: x.users.did,
            avatar: x.users.avatar,
            displayName: x.users.displayName,
            handle: x.users.handle,
          },
          replies: mapShouts(x.shouts.id).reverse(),
        }));
    };

    return mapShouts(null);
  };

  return (
    <Modal
      size={"auto"}
      onClose={onClose}
      isOpen={isOpen}
      overrides={{
        Root: {
          style: {
            zIndex: 1,
          },
        },
        Dialog: {
          style: {
            backgroundColor: "var(--color-background)",
          },
        },
        Close: {
          style: {
            display: "none",
          },
        },
      }}
    >
      <ModalHeader className="m-[16px] flex justify-between">
        <ModalButton
          kind="tertiary"
          onClick={close}
          shape="pill"
          overrides={{
            BaseButton: {
              style: {
                backgroundColor: "var(--color-background) !important",
                color: "var(--color-text) !important",
                ":hover": {
                  backgroundColor: "var(--color-background)",
                },
              },
            },
          }}
        >
          Cancel
        </ModalButton>
        {!loading && (
          <ModalButton
            onClick={handleSubmit(onReply)}
            shape={"pill"}
            disabled={
              watch("message").length === 0 || watch("message").length > 1000
            }
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
            Reply
          </ModalButton>
        )}
        {loading && (
          <Spinner
            $size={22}
            $color="rgb(255, 40, 118)"
            style={{
              margin: 10,
            }}
          />
        )}
      </ModalHeader>
      <ModalBody>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
          }}
        >
          <Link to={`/profile/${shout.user.handle}`} onClick={close}>
            <img
              src={shout.user.avatar}
              className="w-[50px] h-[50px] rounded-full"
            />
          </Link>

          <div className="ml-[20px] w-full">
            <Header>
              <div>
                <Link
                  to={`/profile/${shout.user.handle}`}
                  className="flex no-underline"
                  style={{ textDecoration: "none" }}
                  onClick={() => scrollToTop()}
                >
                  <LabelMedium className="!text-[var(--color-text)] no-underline">
                    {shout.user.displayName}
                  </LabelMedium>
                  <LabelSmall className="ml-[5px] mt-[4px] no-underline !text-[var(--color-text-muted)]">
                    @{shout.user.handle}
                  </LabelSmall>
                </Link>
              </div>
            </Header>
            <Message className="!text-[var(--color-text)]">
              {shout.message}
            </Message>
          </div>
        </div>

        <div className="flex flex-row mt-[20px]">
          <img
            src={profile?.avatar}
            className="w-[50px] h-[50px] rounded-full"
          />
          <Controller
            name="message"
            control={control}
            render={({ field }) => (
              <Textarea
                resize="vertical"
                overrides={{
                  Root: {
                    style: {
                      border: "none",
                    },
                  },
                  InputContainer: {
                    style: {
                      border: "none",
                      backgroundColor: "var(--color-background)",
                    },
                  },
                  Input: {
                    style: {
                      width: "450px",
                      border: "none",
                      backgroundColor: "var(--color-background)",
                      color: "var(--color-text)",
                      caretColor: "var(--color-purple)",
                    },
                  },
                }}
                autoFocus
                maxLength={1000}
                placeholder="Write your reply"
                {...field}
              />
            )}
          />
        </div>
      </ModalBody>
      <ModalFooter></ModalFooter>
    </Modal>
  );
}

export default ReplyModal;
