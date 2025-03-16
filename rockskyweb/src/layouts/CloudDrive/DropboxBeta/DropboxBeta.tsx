import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "baseui/input";
import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
} from "baseui/modal";
import { LabelSmall } from "baseui/typography";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import Dropbox from "../../../components/Icons/Dropbox";
import useBeta from "../../../hooks/useBeta";

const schema = z.object({
  email: z.string().email(),
});

export type DropboxBetaProps = {
  isOpen: boolean;
  close: () => void;
};

function DropboxBeta(props: DropboxBetaProps) {
  const { joinBeta } = useBeta();
  const { isOpen, close } = props;
  const [errorMessage] = useState("");
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

  const onJoinBeta = () => {
    joinBeta(getValues("email"), "dropbox");
    onClose();
  };

  const onClose = () => {
    clearErrors();
    reset();
    close();
  };

  return (
    <>
      <Modal
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
        <ModalHeader>Join the beta program with Dropbox!</ModalHeader>
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
            <Dropbox height="90" width="90" />
            <ul style={{ marginTop: 20, fontSize: 16 }}>
              <li style={{ marginBottom: 10 }}>
                Get early access to our exclusive beta program by linking your
                Dropbox account.
              </li>
              <li style={{ marginBottom: 10 }}>
                Enter your Dropbox email to request access.
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
                placeholder="Dropbox email account"
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

export default DropboxBeta;
