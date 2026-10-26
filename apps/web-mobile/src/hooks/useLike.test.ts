import { QueryClient, MutationObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import useLike from "./useLike";

const mocks = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
  write: vi.fn(),
}));
vi.mock("../api/likes", () => ({
  like: mocks.write,
  unlike: mocks.write,
  likeTrackById: mocks.write,
  unlikeTrackById: mocks.write,
  getLikes: vi.fn(),
}));
vi.mock("@tanstack/react-query", async (original) => {
  const actual = await original<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => mocks.client,
    useMutation: (options: ConstructorParameters<typeof MutationObserver>[1]) => {
      const observer = new actual.MutationObserver(mocks.client, options);
      return { mutateAsync: observer.mutate.bind(observer) };
    },
  };
});

afterEach(() => {
  mocks.client.clear();
  vi.clearAllMocks();
});

describe("like cache refresh", () => {
  it.each(["like", "unlike", "likeTrackById", "unlikeTrackById"] as const)(
    "%s refreshes mounted views only after the write succeeds",
    async (action) => {
      mocks.client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
      const { QueryObserver } = await import("@tanstack/react-query");
      const read = vi.fn().mockResolvedValue({ liked: true });
      mocks.client.setQueryData(["song", "uri"], { liked: false });
      mocks.client.setQueryData(["lovedTracks", "did"], []);
      mocks.client.setQueryData(["loved-tracks", "did"], []);
      mocks.client.setQueryData(["audio-settings"], {});
      const observer = new QueryObserver(mocks.client, {
        queryKey: ["song", "uri"], queryFn: read,
      });
      const unsubscribe = observer.subscribe(() => {});
      let resolve!: () => void;
      mocks.write.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
      const pending = useLike()[action]("uri");
      await vi.waitFor(() => expect(mocks.write.mock.calls[0]?.[0]).toBe("uri"));
      expect(read).not.toHaveBeenCalled();
      resolve();
      await pending;
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      expect(mocks.client.getQueryState(["lovedTracks", "did"])?.isInvalidated).toBe(true);
      expect(mocks.client.getQueryState(["loved-tracks", "did"])?.isInvalidated).toBe(true);
      expect(mocks.client.getQueryState(["audio-settings"])?.isInvalidated).toBe(false);
      unsubscribe();
    },
  );

  it("propagates a failed write without refreshing as though it succeeded", async () => {
    mocks.client = new QueryClient();
    mocks.client.setQueryData(["lovedTracks"], []);
    mocks.write.mockRejectedValueOnce(new Error("Offline"));
    await expect(useLike().like("uri")).rejects.toThrow("Offline");
    expect(mocks.client.getQueryState(["lovedTracks"])?.isInvalidated).toBe(false);
  });
});
