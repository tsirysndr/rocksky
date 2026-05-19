import { useState } from "react";
import useShout from "../../../../../hooks/useShout";

interface DeleteShoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  shoutUri: string;
  refetch: () => Promise<void>;
}

function DeleteShoutModal({ isOpen, onClose, shoutUri, refetch }: DeleteShoutModalProps) {
  const { deleteShout } = useShout();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const onDelete = async () => {
    setLoading(true);
    await deleteShout(shoutUri);
    setLoading(false);
    onClose();
    await refetch();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full rounded-t-[20px] bg-[var(--color-surface)] px-5 pb-9 pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-[var(--color-border)]" />
        <h3 className="mb-2 text-lg font-bold text-[var(--color-text)]">
          Delete shout?
        </h3>
        <p className="mb-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
          This will permanently delete the shout and all replies.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onDelete}
            disabled={loading}
            className={`w-full rounded-[14px] border-none py-[13px] text-[15px] font-bold text-white bg-[var(--color-primary)] ${loading ? "cursor-default opacity-70" : "cursor-pointer"}`}
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={onClose}
            className="w-full cursor-pointer rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-2)] py-[13px] text-[15px] font-semibold text-[var(--color-text)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteShoutModal;
