// `nfc-pcsc` is an optional native dependency (it needs pcsclite headers) and
// ships no types, so it is declared here rather than resolved. Only the surface
// src/lib/nfc.ts actually uses is described; everything else stays `any`.
declare module "nfc-pcsc" {
  export class Reader {
    reader: { name: string };
    read(block: number, length: number, blockSize?: number): Promise<Buffer>;
    write(block: number, data: Buffer, blockSize?: number): Promise<void>;
    /** MIFARE Classic sector authentication. `keyType` is 0x60 (A) or 0x61 (B). */
    authenticate(
      block: number,
      keyType: number,
      key: Buffer | string,
      obsolete?: boolean,
    ): Promise<void>;
    on(event: string, handler: (...args: any[]) => void): void;
  }

  export class NFC {
    constructor(logger?: unknown);
    on(event: "reader", handler: (reader: Reader) => void): void;
    on(event: string, handler: (...args: any[]) => void): void;
    close(): void;
  }
}
