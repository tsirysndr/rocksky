// The "tap a tag" dialog. Opened by the Write to NFC tag menu entry, which
// parks its target in nfcWriteTargetAtom.
//
// The backend arms the reader and resolves only once a tag actually lands on
// it, so this component is a thin wrapper around one long-running invoke:
// open → await → report. Closing the dialog disarms the write, otherwise the
// next tag the user tapped for any reason would get overwritten.

import { IconCheck, IconNfc, IconX } from "@tabler/icons-react";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { nfcWriteTargetAtom } from "../../atoms/nfc";
import { nfcCancelWrite, nfcWrite } from "../../lib/nfc";
import {
  Actions,
  Button,
  ErrorText,
  GhostButton,
  Halo,
  Overlay,
  Panel,
  Subtitle,
  TargetMeta,
  TargetName,
  Title,
} from "./styles";

// baseui's startEnhancer wants a component taking a required numeric `size`;
// the tabler icons' own `size` is wider than that.
const NfcGlyph = ({ size }: { size: number }) => <IconNfc size={size} />;
const FailGlyph = ({ size }: { size: number }) => <IconX size={size} />;

type Phase =
  | { state: "waiting" }
  | { state: "ok" }
  | { state: "error"; message: string };

export default function NfcWriteModal() {
  const [target, setTarget] = useAtom(nfcWriteTargetAtom);
  const [phase, setPhase] = useState<Phase>({ state: "waiting" });
  const { enqueue } = useSnackbar();

  const close = useCallback(() => {
    void nfcCancelWrite();
    setTarget(null);
  }, [setTarget]);

  useEffect(() => {
    if (!target) return;
    let live = true;
    setPhase({ state: "waiting" });

    nfcWrite(target.payloads).then(
      () => {
        if (!live) return;
        setPhase({ state: "ok" });
        enqueue(
          {
            message: `Tag ready — it now plays “${target.label}”`,
            startEnhancer: NfcGlyph,
          },
          DURATION.medium,
        );
      },
      (e: unknown) => {
        if (!live) return;
        const message = e instanceof Error ? e.message : String(e);
        setPhase({ state: "error", message });
        enqueue(
          { message: `Could not write the tag: ${message}`, startEnhancer: FailGlyph },
          DURATION.medium,
        );
      },
    );

    return () => {
      live = false;
    };
  }, [target, enqueue]);

  // Esc closes, which also disarms the pending write.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;

  const retry = () => setTarget({ ...target });

  return (
    <Overlay onMouseDown={close}>
      <Panel onMouseDown={(e) => e.stopPropagation()}>
        <Halo state={phase.state}>
          {phase.state === "ok" ? (
            <IconCheck size={38} />
          ) : phase.state === "error" ? (
            <IconX size={38} />
          ) : (
            <IconNfc size={38} />
          )}
        </Halo>

        <Title>
          {phase.state === "ok"
            ? "Tag written"
            : phase.state === "error"
              ? "Nothing was written"
              : "Hold a tag on the reader"}
        </Title>
        <Subtitle>
          {phase.state === "ok"
            ? target.portable
              ? "Tap it on any Rocksky player to start playing."
              : "Tap it on the reader any time to start playing."
            : phase.state === "error"
              ? "The tag was left untouched."
              : "Keep it there until this dialog confirms."}
        </Subtitle>

        <TargetName>{target.label}</TargetName>
        {target.sublabel && <TargetMeta>{target.sublabel}</TargetMeta>}
        {!target.portable && phase.state !== "error" && (
          <TargetMeta>
            No published record yet — this tag will only work in your library.
          </TargetMeta>
        )}

        {phase.state === "error" && <ErrorText>{phase.message}</ErrorText>}

        <Actions>
          {phase.state === "error" && <Button onClick={retry}>Try again</Button>}
          {phase.state === "ok" ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <GhostButton onClick={close}>Cancel</GhostButton>
          )}
        </Actions>
      </Panel>
    </Overlay>
  );
}
