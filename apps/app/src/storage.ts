import AsyncStorage from "@react-native-async-storage/async-storage";
import { scrobbler } from "../modules/rocksky-scrobbler";
import { API_URL } from "./consts";

let _token: string | null = null;
let _did: string | null = null;

// Ordered native updates prevent an earlier sign-in completing after sign-out.
let nativeSync: Promise<void> = Promise.resolve();
function syncScrobbler() {
  const token = _token;
  const did = _did;
  nativeSync = nativeSync
    .catch(() => {})
    .then(async () => {
      await scrobbler?.setAuth(token, did, API_URL);
    });
  return nativeSync;
}

export const storage = {
  getToken: () => _token,
  getDid: () => _did,

  setSession: async (token: string, did: string) => {
    _token = token;
    _did = did;
    await AsyncStorage.multiSet([
      ["token", token],
      ["did", did],
    ]);
    await syncScrobbler();
  },

  setToken: async (token: string | null) => {
    _token = token;
    if (token) await AsyncStorage.setItem("token", token);
    else await AsyncStorage.removeItem("token");
    await syncScrobbler();
  },

  setDid: async (did: string | null) => {
    _did = did;
    if (did) await AsyncStorage.setItem("did", did);
    else await AsyncStorage.removeItem("did");
    await syncScrobbler();
  },

  load: async () => {
    _token = await AsyncStorage.getItem("token");
    _did = await AsyncStorage.getItem("did");
    // A native setup error must not leave the application stuck on its splash.
    await syncScrobbler().catch((error) =>
      console.warn("Scrobbler setup failed", error),
    );
    return { token: _token, did: _did };
  },

  clear: async () => {
    _token = null;
    _did = null;
    try {
      await syncScrobbler();
    } finally {
      await AsyncStorage.multiRemove(["token", "did", "handle"]);
    }
  },
};
