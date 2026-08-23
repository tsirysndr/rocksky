import { RockskyClient } from "@rocksky/sdk";
import { API_URL } from "../consts";

let cached: { token: string | null; client: RockskyClient } | null = null;

/** The shared SDK client. Reads the token per call so login/logout swaps in a
 * fresh (un)authenticated client automatically. */
export function rocksky(): RockskyClient {
  const token = localStorage.getItem("token");
  if (!cached || cached.token !== token) {
    cached = { token, client: new RockskyClient(API_URL, token || undefined) };
  }
  return cached.client;
}
