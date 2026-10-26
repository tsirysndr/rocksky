import fs from "fs";
import os from "os";
import path from "path";
function loadToken() {
  try {
    const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
    const { token } = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
    return token || void 0;
  } catch {
    return void 0;
  }
}
export {
  loadToken
};
