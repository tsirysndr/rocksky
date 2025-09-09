import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { Spotify } from "@styled-icons/boxicons-logos";
import { Input } from "baseui/input";
import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
} from "baseui/modal";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { LabelSmall } from "baseui/typography";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";
import { profileAtom } from "../../atoms/profile";
import { API_URL } from "../../consts";
import useBeta from "../../hooks/useBeta";

const schema = z.object({
  email: z.string().email(),
});

const ConnectSpotify = styled.span`
  font-weight: bolder;
  &:hover {
    cursor: pointer;
    text-decoration: underline;
  }
`;

function SpotifyLogin() {
  const profile = useAtomValue(profileAtom);
  const [isOpen, setIsOpen] = useState(false);
  const { enqueue } = useSnackbar();
  const { joinBeta } = useBeta();
  const [errorMessage, setErrorMessage] = useState("");
  const {
    control,
    getValues,
    formState: { errors },
    clearErrors,
    reset,
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onBlur",
  });

  useEffect(() => {
    if (isOpen) {
      clearErrors();
      setErrorMessage("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    clearErrors();
    reset();
  };

  const onJoinBeta = async () => {
    try {
      if (errors.email) {
        return;
      }

      const { email } = getValues();
      await joinBeta(email, "spotify");
      enqueue(
        {
          message:
            "Your request to join the beta program has been submitted. We'll notify you once you're approved!",
        },
        DURATION.long,
      );

      close();
    } catch {
      setErrorMessage("Something went wrong. Please try again later.");
    }
  };

  const onConnectSpotify = async () => {
    const did = localStorage.getItem("did");
    if (!did || (errors.email && isOpen)) {
      return;
    }

    if (!profile?.spotifyUser?.isBeta) {
      setIsOpen(true);
      return;
    }

    localStorage.setItem("spotify", "true");

    const response = await fetch(`${API_URL}/spotify/login`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    const data = await response.json();
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  };

  return (
    <>
      <div className="flex items-center">
        <div className="mr-[15px]">
          <Spotify size={52} />
        </div>
        <p className="m-[0px] text-[var(--color-text)]">
          <ConnectSpotify onClick={onConnectSpotify}>Connect</ConnectSpotify>{" "}
          your Spotify account to share what you're listening
        </p>
      </div>
      <Modal
        onClose={close}
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
              color: "var(--color-text)",
              ":hover": {
                color: "var(--color-text)",
                opacity: 0.8,
              },
            },
          },
        }}
      >
        <ModalHeader className="!text-[var(--color-text)]">
          Join the beta program with Spotify!
        </ModalHeader>
        <ModalBody>
          <div className="flex items-center justify-center mb-[50px] mt-[50px] flex-col">
            <Spotify size={90} color="#1dd05d" />
            <ul className="mt-[20px] text-[16px]">
              <li className="mb-[10px] text-[var(--color-text)]">
                Get early access to our exclusive beta program by linking your
                Spotify account.
              </li>
              <li className="mb-[10px] text-[var(--color-text)]">
                Enter your Spotify email to request access.
              </li>{" "}
              <li className="text-[var(--color-text)]">
                We'll notify you once you're approved!
              </li>
            </ul>
          </div>

          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                placeholder="Spotify email account"
                clearable
                clearOnEscape
                error={!!errors.email}
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
                  ClearIcon: {
                    style: {
                      color: "var(--color-clear-input) !important",
                    },
                  },
                }}
              />
            )}
          />
          <LabelSmall color="red" marginTop={"5px"}>
            <div>
              <div>
                <>{errors.email?.message || ""}</>
              </div>
              <div>
                {errorMessage || (errors.email?.message && isOpen ? "" : "")}
              </div>
            </div>
          </LabelSmall>
        </ModalBody>
        <ModalFooter>
          <ModalButton
            onClick={onJoinBeta}
            overrides={{
              BaseButton: {
                style: {
                  ":hover": {
                    backgroundColor: "var(--color-primary)",
                  },
                  ":focus": {
                    backgroundColor: "var(--color-primary)",
                  },
                },
              },
            }}
          >
            Join the beta
          </ModalButton>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default SpotifyLogin;
