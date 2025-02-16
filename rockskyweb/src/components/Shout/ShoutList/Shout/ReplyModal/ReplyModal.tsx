import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
} from "baseui/modal";
import { Textarea } from "baseui/textarea";
import { LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { Controller, useForm } from "react-hook-form";
import { Link as DefaultLink, useParams } from "react-router";
import z from "zod";
import { profileAtom } from "../../../../../atoms/profile";
import { shoutsAtom } from "../../../../../atoms/shouts";
import useShout from "../../../../../hooks/useShout";

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
  const { did, rkey } = useParams<{ did: string; rkey: string }>();

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<z.infer<typeof ShoutSchema>>({
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
    await reply(shout.uri, message);
    reset();
    close();

    let uri = "";

    if (location.pathname.startsWith("/profile")) {
      uri = `at://${did}`;
    }

    if (location.pathname.includes("app.rocksky.scrobble")) {
      uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    }

    if (location.pathname.includes("app.rocksky.song")) {
      uri = `at://${did}/app.rocksky.song/${rkey}`;
    }

    if (location.pathname.includes("app.rocksky.album")) {
      uri = `at://${did}/app.rocksky.album/${rkey}`;
    }

    if (location.pathname.includes("app.rocksky.artist")) {
      uri = `at://${did}/app.rocksky.artist/${rkey}`;
    }

    const data = await getShouts(uri);
    setShouts({
      ...shouts,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [location.pathname]: data.map((x: any) => ({
        uri: (x.shouts || x).uri,
        message: (x.shouts || x).content,
        date: (x.shouts || x).createdAt,
        user: {
          avatar: (x.users || x.authors).avatar,
          displayName: (x.users || x.authors).displayName,
          handle: (x.users || x.authors).handle,
        },
      })),
    });
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
        Close: {
          style: {
            display: "none",
          },
        },
      }}
    >
      <ModalHeader
        style={{
          margin: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <ModalButton kind="tertiary" onClick={close} shape="pill">
          Cancel
        </ModalButton>
        <ModalButton
          onClick={handleSubmit(onReply)}
          shape={"pill"}
          disabled={
            watch("message").length === 0 || watch("message").length > 1000
          }
        >
          Reply
        </ModalButton>
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
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
              }}
            />
          </Link>

          <div style={{ marginLeft: 20, width: "100%" }}>
            <Header>
              <div>
                <Link to={`/profile/${shout.user.handle}`} onClick={close}>
                  <LabelMedium>{shout.user.displayName}</LabelMedium>
                </Link>
              </div>
            </Header>
            <Message>{shout.message}</Message>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "row", marginTop: 20 }}>
          <img
            src={profile?.avatar}
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
            }}
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
                      backgroundColor: "#fff",
                    },
                  },
                  Input: {
                    style: {
                      width: "450px",
                      border: "none",
                      backgroundColor: "#fff",
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
