import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalHeader } from "baseui/modal";
import { LabelMedium } from "baseui/typography";
import { useState } from "react";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  like?: boolean;
  follow?: boolean;
}

function SignInModal(props: SignInModalProps) {
  const { isOpen, onClose, like, follow } = props;
  const [handle, setHandle] = useState("");

  const onLogin = async () => {
    if (!handle.trim()) {
      return;
    }

    onClose();

    window.location.href = `https://rocksky.pages.dev/loading?handle=${handle}`;
  };

  return (
    <>
      <Modal
        size={"auto"}
        onClose={onClose}
        isOpen={isOpen}
        overrides={{
          Root: {
            style: {
              zIndex: 50,
            },
          },
          Dialog: {
            style: {
              backgroundColor: "var(--color-background)",
            },
          },
          Close: {
            style: {
              color: "var(--color-text)",
              ":hover": {
                color: "var(--color-text)",
                opacity: 0.8,
              },
            },
          },
        }}
      >
        <ModalHeader></ModalHeader>
        <ModalBody style={{ padding: 10 }}>
          <h1 style={{ color: "#ff2876", textAlign: "center" }}>Rocksky</h1>
          <p className="text-[var(--color-text)] text-[18px] mt-[40px] mb-[20px]">
            {!like
              ? !follow
                ? "Sign in or create your account to join the conversation!"
                : "Sign in or create your account to follow users!"
              : "Sign in or create your account to like songs!"}
          </p>
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 15 }}>
              <LabelMedium className="!text-[var(--color-text)]">
                Handle
              </LabelMedium>
            </div>
            <Input
              name="handle"
              startEnhancer={
                <div className="text-[var(--color-text-muted)] bg-[var(--color-input-background)]">
                  @
                </div>
              }
              placeholder="<username>.bsky.social"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              overrides={{
                Root: {
                  style: {
                    backgroundColor: "var(--color-input-background)",
                    borderColor: "var(--color-input-background)",
                  },
                },
                StartEnhancer: {
                  style: {
                    backgroundColor: "var(--color-input-background)",
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
          </div>
          <Button
            onClick={onLogin}
            overrides={{
              BaseButton: {
                style: {
                  width: "100%",
                  backgroundColor: "#ff2876",
                  ":hover": {
                    backgroundColor: "#ff2876",
                  },
                  ":focus": {
                    backgroundColor: "#ff2876",
                  },
                },
              },
            }}
          >
            Sign In
          </Button>
          <LabelMedium
            marginTop={"20px"}
            className="!text-[var(--color-text-muted)] text-center"
          >
            Don't have an atproto handle yet?
          </LabelMedium>
          <div className="text-[var(--color-text-muted)] text-center text-[16px]">
            You can create one at{" "}
            <a
              href="https://bsky.app"
              className="text-[var(--color-primary)] no-underline cursor-pointer text-center"
              target="_blank"
            >
              Bluesky
            </a>{" "}
            or any other AT Protocol service.
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}

export default SignInModal;
