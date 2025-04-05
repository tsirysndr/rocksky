import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { Modal, ModalBody, ModalHeader } from "baseui/modal";
import { LabelMedium } from "baseui/typography";
import { useState } from "react";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SignInModal(props: SignInModalProps) {
  const { isOpen, onClose } = props;
  const [handle, setHandle] = useState("");

  const onLogin = async () => {
    if (!handle.trim()) {
      return;
    }

    window.location.href = `https://rocksky.pages.dev/loading?handle=${handle}`;

    onClose();
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
              zIndex: 1,
            },
          },
        }}
      >
        <ModalHeader></ModalHeader>
        <ModalBody style={{ padding: 10 }}>
          <h1 style={{ color: "#ff2876", textAlign: "center" }}>Rocksky</h1>
          <p
            style={{
              fontSize: 18,
              marginTop: 40,
              marginBottom: 20,
            }}
          >
            Sign in or create your account to join the conversation!
          </p>
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 15 }}>
              <LabelMedium>Bluesky handle</LabelMedium>
            </div>
            <Input
              name="handle"
              startEnhancer={<div style={{ color: "#42576ca6" }}>@</div>}
              placeholder="<username>.bsky.social"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
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
            style={{
              textAlign: "center",
              color: "#42576ca6",
            }}
          >
            Don't have an account?
          </LabelMedium>
          <div
            style={{
              color: "#42576ca6",
              textAlign: "center",
            }}
          >
            <a
              href="https://bsky.app"
              style={{
                color: "#ff2876",
                textDecoration: "none",
                cursor: "pointer",
                textAlign: "center",
              }}
              target="_blank"
            >
              Sign up for Bluesky
            </a>{" "}
            to create one now!
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}

export default SignInModal;
