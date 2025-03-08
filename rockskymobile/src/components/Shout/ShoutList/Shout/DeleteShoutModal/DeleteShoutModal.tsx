import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
} from "baseui/modal";
import { Spinner } from "baseui/spinner";
import { useState } from "react";
import useShout from "../../../../../hooks/useShout";

interface DeleteShoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  shoutUri: string;
  refetch: () => Promise<void>;
}

function DeleteShoutModal(props: DeleteShoutModalProps) {
  const { isOpen, onClose } = props;
  const { deleteShout } = useShout();
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    setLoading(true);
    await deleteShout(props.shoutUri);
    setLoading(false);
    onClose();
    await props.refetch();
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
          Delete Shout
        </ModalHeader>
        <ModalBody>
          <p style={{ fontSize: 16 }}>
            Are you sure you want to delete this shout? Any replies to this
            shout will also be deleted.
          </p>
        </ModalBody>
        <ModalFooter style={{ justifyContent: "flex-end", display: "flex" }}>
          {!loading && (
            <>
              <ModalButton kind="tertiary" onClick={onClose} shape="pill">
                Cancel
              </ModalButton>
              <ModalButton onClick={onDelete} shape={"pill"}>
                Delete
              </ModalButton>
            </>
          )}
          {loading && <Spinner $size={25} $color="rgb(255, 40, 118)" />}
        </ModalFooter>
      </Modal>
    </>
  );
}

export default DeleteShoutModal;
