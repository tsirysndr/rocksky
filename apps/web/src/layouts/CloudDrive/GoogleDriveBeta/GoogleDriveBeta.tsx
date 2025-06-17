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
import GoogleDrive from "../../../components/Icons/GoogleDrive";
import useBeta from "../../../hooks/useBeta";

const schema = z.object({
  email: z.string().email(),
});

export type GoogleDriveBetaProps = {
  isOpen: boolean;
  close: () => void;
};

function GoogleDriveBeta(props: GoogleDriveBetaProps) {
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
    joinBeta(getValues("email"), "google");
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
        <ModalHeader>Join the beta program with Google Drive!</ModalHeader>
        <ModalBody>
          <div className="flex items-center justify-center mb-[50px] mt-[50px] flex-col">
            <GoogleDrive height="90" width="90" />
            <ul className="mt-[20px] text-[16px]">
              <li className="mb-[10px]">
                Get early access to our exclusive beta program by linking your
                Google Drive account.
              </li>
              <li className="mb-[10px]">
                Enter your Google Drive email to request access.
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
                placeholder="Google drive email account"
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

export default GoogleDriveBeta;
