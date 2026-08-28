// `rocksky nfc` — write and inspect NFC tags outside the TUI.
//
// Inside the TUI, T on an album or playlist writes a tag and a tap plays it
// (see src/tui/nfc.ts). These subcommands cover the scripted cases: checking
// that a reader works, dumping what a tag holds, and writing a known library id.

import chalk from "chalk";
import { loadToken } from "lib/token";
import {
  NfcUnavailableError,
  nfcPayloadFor,
  openNfc,
  parseNfcPayload,
} from "../lib/nfc";
import { getAlbum, getCreds, getPlaylist } from "../tui/navidrome";

const violet = chalk.hex("#A855F7");
const cyan = chalk.hex("#22D3EE");

function fail(e: unknown): never {
  const message = e instanceof Error ? e.message : String(e);
  console.error(chalk.red(message));
  process.exit(1);
}

/** Describe what a payload points at, so a dump is readable rather than a URI. */
async function describe(payload: string): Promise<string> {
  const target = parseNfcPayload(payload);
  if (!target) return chalk.yellow("not a Rocksky tag");
  const token = loadToken();
  if (!token) return `${target.kind}`;
  try {
    const creds = await getCreds(token);
    if (!creds) return `${target.kind}`;
    if (target.kind === "album") {
      const { album } = await getAlbum(creds, target.id);
      return `album · ${album?.name ?? target.id}`;
    }
    if (target.kind === "playlist") {
      const { playlist } = await getPlaylist(creds, target.id);
      return `playlist · ${playlist?.name ?? target.id}`;
    }
    return `playlist · ${target.uri}`;
  } catch {
    return `${target.kind} (not in your library)`;
  }
}

export async function nfcStatus() {
  try {
    const session = await openNfc();
    const readers: string[] = [];
    session.onReader((name, connected) => connected && readers.push(name));
    // Readers announce themselves asynchronously right after the session opens.
    await new Promise((r) => setTimeout(r, 800));
    session.close();

    if (readers.length === 0) {
      console.log(chalk.yellow("No NFC reader connected."));
      console.log(
        chalk.dim("Plug in a PC/SC reader (ACR122U or another ACS/CCID model)."),
      );
      process.exit(1);
    }
    console.log(chalk.green(`${readers.length} reader(s) connected:`));
    for (const name of readers) console.log(`  ${cyan(name)}`);
  } catch (e) {
    fail(e);
  }
}

export async function nfcRead(opts: { watch?: boolean } = {}) {
  try {
    const session = await openNfc();
    console.log(violet("Hold a tag on the reader…"));

    session.onTag(async ({ uid, payload }) => {
      const label = payload ? await describe(payload) : chalk.dim("empty tag");
      console.log(`${chalk.dim(uid)}  ${payload ?? ""}  ${label}`);
      if (!opts.watch) {
        session.close();
        process.exit(0);
      }
    });

    if (!opts.watch) {
      setTimeout(() => {
        session.close();
        console.error(chalk.red("Timed out waiting for a tag."));
        process.exit(1);
      }, 30_000);
    }
  } catch (e) {
    fail(e);
  }
}

export async function nfcWrite(opts: { album?: string; playlist?: string }) {
  const kind = opts.album ? "album" : opts.playlist ? "playlist" : null;
  const id = opts.album ?? opts.playlist;
  if (!kind || !id) {
    console.error(chalk.red("Pass either --album <id> or --playlist <id>."));
    console.error(
      chalk.dim(
        "Ids are the library ones — `rocksky` (TUI) → My Music → T writes them for you.",
      ),
    );
    process.exit(1);
  }

  try {
    const payload = nfcPayloadFor(kind, id);
    const session = await openNfc();
    console.log(violet(`Hold a tag on the reader to write ${cyan(payload)}…`));
    await session.write(payload);
    session.close();
    console.log(chalk.green("Tag written. Tap it to play."));
    process.exit(0);
  } catch (e) {
    if (e instanceof NfcUnavailableError) fail(e);
    fail(e);
  }
}
