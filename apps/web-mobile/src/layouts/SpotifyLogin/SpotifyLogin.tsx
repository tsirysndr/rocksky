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
      await joinBeta(email);
      enqueue(
        {
          message:
            "Your request to join the beta program has been submitted. We'll notify you once you're approved!",
        },
        DURATION.long
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
      <div
        style={{
          marginTop: 30,
          marginBottom: 30,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ marginRight: 15 }}>
          <Spotify size={52} />
        </div>
        <p style={{ margin: 0 }}>
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
        }}
      >
        <ModalHeader>Join the beta program with Spotify!</ModalHeader>
        <ModalBody>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 50,
              marginTop: 50,
              flexDirection: "column",
            }}
          >
            <Spotify size={90} color="#1dd05d" />
            <ul style={{ marginTop: 20, fontSize: 16 }}>
              <li style={{ marginBottom: 10 }}>
                Get early access to our exclusive beta program by linking your
                Spotify account.
              </li>
              <li style={{ marginBottom: 10 }}>
                Enter your Spotify email to request access.
              </li>{" "}
              <li>We'll notify you once you're approved!</li>
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
          <ModalButton onClick={onJoinBeta}>Join the beta</ModalButton>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default SpotifyLogin;
