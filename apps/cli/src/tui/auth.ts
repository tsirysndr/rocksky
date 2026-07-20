import axios from "axios";
import cors from "cors";
import express from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";

const rockskyDir = () => path.join(os.homedir(), ".rocksky");

/**
 * Runs the OAuth login flow: asks the API for an authorize URL, opens the
 * browser, and waits for the callback to POST the session token back to a
 * short-lived local server. Resolves with the saved token.
 */
export function signIn(
  handle: string,
  onStatus: (message: string) => void,
): Promise<string> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  return new Promise<string>((resolve, reject) => {
    const server = app.listen(6996);
    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error("Login timed out"));
      },
      5 * 60 * 1000,
    );

    app.post("/token", async (req, res) => {
      const token = req.body.token as string;
      const tokenPath = path.join(rockskyDir(), "token.json");
      await fs.mkdir(rockskyDir(), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify({ token }, null, 2));
      res.json({ ok: 1 });
      clearTimeout(timeout);
      server.close();
      resolve(token);
    });

    onStatus("Contacting Rocksky…");
    axios
      .post("https://api.rocksky.app/login", { handle, cli: true })
      .then(async ({ data: redirectUrl }) => {
        if (
          typeof redirectUrl !== "string" ||
          !redirectUrl.includes("authorize")
        ) {
          clearTimeout(timeout);
          server.close();
          reject(new Error("Invalid handle"));
          return;
        }
        onStatus("Opening browser to authorize…");
        const open = (await import("open")).default;
        await open(redirectUrl);
        onStatus("Waiting for authorization in your browser…");
      })
      .catch((e) => {
        clearTimeout(timeout);
        server.close();
        reject(e);
      });
  });
}

/** Remove the saved session (token + cached DID). */
export async function signOut(): Promise<void> {
  const dir = rockskyDir();
  await fs.rm(path.join(dir, "token.json"), { force: true });
  await fs.rm(path.join(dir, "did"), { force: true });
}
