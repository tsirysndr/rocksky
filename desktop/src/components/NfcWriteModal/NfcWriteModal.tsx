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
import { useNfcStatus } from "../../hooks/useNfc";
import {
  Actions,
  Button,
  ErrorText,
  GhostButton,
  Halo,
  Overlay,
  Panel,
  SecretInput,
  SecretLabel,
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

  // A contact card (SLE/ACOS) is detected by its ATR the moment it is inserted,
  // and cannot be written without its code. So the write is not armed until the
  // user confirms one — prefilled with the factory default, which is what an
  // unused card still has. A contactless tag needs nothing and arms straight
  // away, exactly as before.
  const card = useNfcStatus().card;
  const [secret, setSecret] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const needsSecret = !!card && !confirmed;

  // Prefill when a card appears, and re-prefill if a different one replaces it.
  useEffect(() => {
    if (card) setSecret(card.defaultSecret);
  }, [card?.label, card?.defaultSecret]);

  // A card inserted after the write was already armed would be written without
  // its code and simply fail, so disarm and ask first.
  useEffect(() => {
    if (needsSecret && phase.state === "waiting") void nfcCancelWrite();
  }, [needsSecret, phase.state]);

  const close = useCallback(() => {
    void nfcCancelWrite();
    setTarget(null);
  }, [setTarget]);

  useEffect(() => {
    if (!target || needsSecret) return;
    let live = true;
    setPhase({ state: "waiting" });

    nfcWrite(target.payloads, card ? secret : undefined).then(
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
    // `secret` is deliberately not a dependency: it is read once when the write
    // arms, and re-arming on every keystroke would cancel the pending write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enqueue, needsSecret, card]);

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

  const retry = () => {
    setConfirmed(false);
    setPhase({ state: "waiting" });
    setTarget({ ...target });
  };

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
            ? "Card written"
            : phase.state === "error"
              ? "Nothing was written"
              : needsSecret
                ? `Unlock the ${card.label}`
                : "Hold a tag on the reader"}
        </Title>
        <Subtitle>
          {phase.state === "ok"
            ? target.portable
              ? "Tap it on any Rocksky player to start playing."
              : "Tap it on the reader any time to start playing."
            : phase.state === "error"
              ? "The card was left untouched."
              : needsSecret
                ? `Writing needs its ${card.secretLabel}. The factory default is filled in — change it if this card has its own.`
                : "Keep it there until this dialog confirms."}
        </Subtitle>

        <TargetName>{target.label}</TargetName>
        {target.sublabel && <TargetMeta>{target.sublabel}</TargetMeta>}
        {!target.portable && phase.state !== "error" && (
          <TargetMeta>
            No published record yet — this tag will only work in your library.
          </TargetMeta>
        )}

        {needsSecret && phase.state !== "ok" && phase.state !== "error" && (
          <>
            <SecretLabel htmlFor="nfc-secret">{card.secretLabel}</SecretLabel>
            <SecretInput
              id="nfc-secret"
              value={secret}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && secret.trim()) setConfirmed(true);
              }}
            />
            {card.secretLabel === "PSC" && (
              <TargetMeta>
                A wrong code counts against the card's retry counter, and enough
                wrong ones lock it for good.
              </TargetMeta>
            )}
          </>
        )}

        {phase.state === "error" && <ErrorText>{phase.message}</ErrorText>}

        <Actions>
          {phase.state === "error" && <Button onClick={retry}>Try again</Button>}
          {phase.state === "ok" ? (
            <Button onClick={close}>Done</Button>
          ) : needsSecret ? (
            <>
              <Button disabled={!secret.trim()} onClick={() => setConfirmed(true)}>
                Write
              </Button>
              <GhostButton onClick={close}>Cancel</GhostButton>
            </>
          ) : (
            <GhostButton onClick={close}>Cancel</GhostButton>
          )}
        </Actions>
      </Panel>
    </Overlay>
  );
}
