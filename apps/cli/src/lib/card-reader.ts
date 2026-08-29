// PC/SC access for contact cards, one operation at a time.
//
// Deliberately not nfc-pcsc: that library connects with SCARD_PROTOCOL_T0|T1
// and never passes the protocol through (the line is commented out in its
// Reader.js), so a synchronous memory card like the SLE5528 — which only
// answers over SCARD_PROTOCOL_RAW — is unreachable through it. The layer it is
// built on, @pokusew/pcsclite, does take an explicit protocol.
//
// Sessions are short-lived and explicit: open, do one read or write, close.
// That keeps this off the reader while the TUI's tag watcher is running, since
// two PC/SC clients driving the same card interleave their APDUs and corrupt
// each other's responses.

import type { CardKind, Transmit } from "./cards";
import { cardKindFromAtr } from "./cards";

export class CardUnavailableError extends Error {
  constructor(cause: string) {
    super(
      `No smart card available: ${cause}\n` +
        "Install the optional reader support with `npm i -g nfc-pcsc`, connect an " +
        "ACS contact reader (ACR39U or similar), and insert a card.",
    );
    this.name = "CardUnavailableError";
  }
}

/**
 * A card connected and ready for APDUs.
 *
 * `close()` releases the reader, but the PC/SC binding keeps handles that hold
 * the event loop open, so a command that has finished its work still has to
 * exit the process itself — see the `card` commands.
 */
export interface CardSession {
  kind: CardKind;
  reader: string;
  atr: Buffer;
  transmit: Transmit;
  close(): void;
}

// @pokusew/pcsclite ships no types and is reached through nfc-pcsc, an optional
// dependency — so it is loaded lazily and described loosely here rather than
// exploding at import time on a machine that will never see a reader.
async function loadPcsc(): Promise<any> {
  try {
    return (await import("@pokusew/pcsclite")).default;
  } catch (e: any) {
    throw new CardUnavailableError(e?.message ?? "@pokusew/pcsclite is not installed");
  }
}

/**
 * Wait for a contact card and connect to it.
 *
 * Tries T=0/T=1 first for processor cards, then RAW for synchronous memory
 * cards. Resolves only once the ATR identifies a card we actually speak, so a
 * contactless tag on another reader is ignored rather than half-handled.
 */
export async function openCard(timeoutMs = 15_000): Promise<CardSession> {
  const pcsclite = await loadPcsc();
  const pcsc = pcsclite();

  return new Promise<CardSession>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const fail = (e: Error) =>
      finish(() => {
        try {
          pcsc.close();
        } catch {
          // Already torn down.
        }
        reject(e);
      });

    const timer = setTimeout(
      () => fail(new CardUnavailableError("timed out waiting for a card")),
      timeoutMs,
    );

    pcsc.on("error", (e: Error) =>
      fail(new CardUnavailableError(e?.message ?? "PC/SC unavailable")),
    );

    pcsc.on("reader", (reader: any) => {
      reader.on("error", () => {
        // Transient; a card pulled mid-read is normal.
      });

      reader.on("status", (status: any) => {
        const changed = status.state ^ reader.state;
        reader.state = status.state;
        const present = status.state & reader.SCARD_STATE_PRESENT;
        if (!(changed & reader.SCARD_STATE_PRESENT) || !present) return;

        const atr: Buffer = status.atr ?? Buffer.alloc(0);
        const kind = cardKindFromAtr(atr);
        // Anything else — a contactless tag, an unknown card — is not ours.
        if (!kind || settled) return;

        const attempt = (protocol: number, onFail: () => void) => {
          reader.connect(
            { share_mode: reader.SCARD_SHARE_SHARED, protocol },
            (err: Error | null, negotiated: number) => {
              if (err) return onFail();
              finish(() =>
                resolve({
                  kind,
                  reader: reader.name,
                  atr,
                  transmit: (apdu: Buffer) =>
                    new Promise<Buffer>((res, rej) =>
                      reader.transmit(apdu, 512, negotiated, (e: Error | null, r: Buffer) =>
                        e ? rej(new Error(e.message)) : res(r),
                      ),
                    ),
                  close() {
                    try {
                      reader.disconnect(reader.SCARD_LEAVE_CARD, () => pcsc.close());
                    } catch {
                      try {
                        pcsc.close();
                      } catch {
                        // Already torn down.
                      }
                    }
                  },
                }),
              );
            },
          );
        };

        // Processor cards speak T=0/T=1; synchronous memory cards only RAW.
        attempt(reader.SCARD_PROTOCOL_T0 | reader.SCARD_PROTOCOL_T1, () =>
          attempt(reader.SCARD_PROTOCOL_RAW, () =>
            fail(new CardUnavailableError("the card would not connect over T=0/T=1 or RAW")),
          ),
        );
      });
    });
  });
}
