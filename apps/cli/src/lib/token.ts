import fs from "fs";
import os from "os";
import path from "path";

/**
 * Reads the session token saved by `rocksky login` from
 * `~/.rocksky/token.json`. Returns undefined when the user is not logged in.
 */
export function loadToken(): string | undefined {
  try {
    const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
    const { token } = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
    return token || undefined;
  } catch {
    return undefined;
  }
}
