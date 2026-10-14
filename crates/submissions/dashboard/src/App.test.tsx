import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider, createStore } from "jotai";
import { App } from "./App";
import { secretAtom, sectionAtom } from "./state";
import type { Overview } from "./api";
const overview: Overview = {
  as_of: 1800000000,
  backend: "PostgreSQL",
  counts: [
    {
      kind: "jetstream.commit.v1",
      status: "pending",
      count: 12,
      oldest_created_at: 1799999990,
    },
  ],
  cursors: [],
  completions: [],
  cleanup: {
    enabled: true,
    completed_retention_seconds: 604800,
    dedup_retention_seconds: 7776000,
    interval_seconds: 300,
    batch_size: 500,
  },
};
function setup(secret = "", section: "overview" | "jobs" = "overview") {
  const store = createStore();
  store.set(secretAtom, secret);
  store.set(sectionAtom, section);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </Provider>,
  );
  return { store, client };
}
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("dashboard access and live controls", () => {
  it("authenticates without storing the secret, changes theme, and disconnects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(overview), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { store, client } = setup();
    expect(document.documentElement.dataset.theme).toBe("rocksky-dark");
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    expect(document.documentElement.dataset.theme).toBe("rocksky-light");
    fireEvent.change(screen.getByLabelText("Service secret"), {
      target: { value: "private-test-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Open dashboard/ }));
    await screen.findByText("Queue overview");
    expect(store.get(secretAtom)).toBe("private-test-secret");
    expect(JSON.stringify(localStorage)).not.toContain("private-test-secret");
    expect(
      fetchMock.mock.calls[0][1].headers["x-rocksky-submissions-secret"],
    ).toBe("private-test-secret");
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ),
    ).not.toContain("private-test-secret");
    fireEvent.click(screen.getByRole("button", { name: "Live · 5s" }));
    expect(screen.getByRole("button", { name: "Paused" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await screen.findByText("Connect to your queue");
    expect(store.get(secretAtom)).toBe("");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it("shows authentication failure and keeps the queue locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );
    const { store } = setup();
    fireEvent.change(screen.getByLabelText("Service secret"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Open dashboard/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(store.get(secretAtom)).toBe("");
  });
  it("filters jobs and requires confirmation before retrying a failed job", async () => {
    const job = {
      id: "a".repeat(64),
      kind: "jetstream.commit.v1",
      status: "failed",
      attempts: 3,
      available_at: 0,
      lease_until: 0,
      last_error: "callback unavailable",
      created_at: 100,
      updated_at: 200,
      compacted_at: 0,
    };
    const mock = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") return new Response("", { status: 202 });
      return new Response(
        JSON.stringify(
          url.includes("/overview")
            ? overview
            : url.includes(`/jobs/${job.id}`)
              ? { job, steps: [] }
              : { jobs: [job], next: null },
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mock);
    setup("test-secret", "jobs");
    await screen.findByText("aaaaaaaaaaaaaa…");
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "failed" },
    });
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => url.includes("status=failed")),
      ).toBe(true),
    );
    fireEvent.click(await screen.findByText("aaaaaaaaaaaaaa…"));
    await screen.findByText("Retry failed job");
    fireEvent.click(screen.getByText("Retry failed job"));
    expect(mock.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByText("Confirm retry"));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, o]) => url.endsWith("/retry") && o?.method === "POST",
        ),
      ).toBe(true),
    );
  });
});
