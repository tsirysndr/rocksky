import { session } from "../../../output/Rocksky.Cli.Tui.Model/index.js";
import fs from "fs";
import os from "os";
import path from "path";
const sessionPath = () => path.join(os.homedir(), ".rocksky", "tui-session.json");
function loadSession() {
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath(), "utf-8"));
    return session(data);
  } catch {
    return null;
  }
}
function saveSession(state) {
  try {
    if (!state) return;
    fs.mkdirSync(path.dirname(sessionPath()), { recursive: true });
    fs.writeFileSync(sessionPath(), JSON.stringify(state));
  } catch {
  }
}
function clearSession() {
  try {
    fs.rmSync(sessionPath(), { force: true });
  } catch {
  }
}
export {
  clearSession,
  loadSession,
  saveSession
};
