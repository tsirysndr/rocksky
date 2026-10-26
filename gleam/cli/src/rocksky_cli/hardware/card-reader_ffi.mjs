// PC/SC wire-protocol adapter ported from apps/cli (Apache-2.0).
import { cardKindFromAtr } from "./cards_ffi.mjs";
class CardUnavailableError extends Error {
  constructor(cause) {
    super(
      `No smart card available: ${cause}
Install the optional reader support with \`npm i -g nfc-pcsc\`, connect an ACS contact reader (ACR39U or similar), and insert a card.`
    );
    this.name = "CardUnavailableError";
  }
}
async function loadPcsc() {
  try {
    return (await import("@pokusew/pcsclite")).default;
  } catch (e) {
    throw new CardUnavailableError(e?.message ?? "@pokusew/pcsclite is not installed");
  }
}
async function openCard(timeoutMs = 15e3) {
  const pcsclite = await loadPcsc();
  const pcsc = pcsclite();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const fail = (e) => finish(() => {
      try {
        pcsc.close();
      } catch {
      }
      reject(e);
    });
    const timer = setTimeout(
      () => fail(new CardUnavailableError("timed out waiting for a card")),
      timeoutMs
    );
    pcsc.on(
      "error",
      (e) => fail(new CardUnavailableError(e?.message ?? "PC/SC unavailable"))
    );
    pcsc.on("reader", (reader) => {
      reader.on("error", () => {
      });
      reader.on("status", (status) => {
        const changed = status.state ^ reader.state;
        reader.state = status.state;
        const present = status.state & reader.SCARD_STATE_PRESENT;
        if (!(changed & reader.SCARD_STATE_PRESENT) || !present) return;
        const atr = status.atr ?? Buffer.alloc(0);
        const kind = cardKindFromAtr(atr);
        if (!kind || settled) return;
        const attempt = (protocol, onFail) => {
          reader.connect(
            { share_mode: reader.SCARD_SHARE_SHARED, protocol },
            (err, negotiated) => {
              if (err) return onFail();
              finish(
                () => resolve({
                  kind,
                  reader: reader.name,
                  atr,
                  transmit: (apdu) => new Promise(
                    (res, rej) => reader.transmit(
                      apdu,
                      512,
                      negotiated,
                      (e, r) => e ? rej(new Error(e.message)) : res(r)
                    )
                  ),
                  close() {
                    try {
                      reader.disconnect(reader.SCARD_LEAVE_CARD, () => pcsc.close());
                    } catch {
                      try {
                        pcsc.close();
                      } catch {
                      }
                    }
                  }
                })
              );
            }
          );
        };
        attempt(
          reader.SCARD_PROTOCOL_T0 | reader.SCARD_PROTOCOL_T1,
          () => attempt(
            reader.SCARD_PROTOCOL_RAW,
            () => fail(new CardUnavailableError("the card would not connect over T=0/T=1 or RAW"))
          )
        );
      });
    });
  });
}
export {
  CardUnavailableError,
  openCard
};
