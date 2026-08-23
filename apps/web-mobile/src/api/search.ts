import { rocksky } from "../lib/rocksky";

// The `any` return preserves the previous untyped axios `response.data`
// contract for existing consumers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const search = async (query: string): Promise<any> => {
  return rocksky().get("app.rocksky.feed.search", { query, size: 100 });
};
