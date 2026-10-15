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
import { App, Chart, ProcessingTimeline } from "./App";
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
function setup(
  secret: string | undefined = undefined,
  section: "overview" | "jobs" = "overview",
) {
  const store = createStore();
  if (secret !== undefined) store.set(secretAtom, secret);
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
  it("opens publicly without a secret and supports theme and live controls", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(overview), { status: 200 }),
      );
    vi.stubGlobal("fetch", mock);
    setup();
    await screen.findByText("Queue overview");
    expect(screen.queryByLabelText("Service secret")).toBeNull();
    expect(mock.mock.calls[0][1].headers).toEqual({});
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    expect(document.documentElement.dataset.theme).toBe("rocksky-light");
    fireEvent.click(screen.getByRole("button", { name: "Live · 5s" }));
    expect(screen.getByRole("button", { name: "Paused" })).toBeTruthy();
  });
  it("filters jobs and requires confirmation before retrying a failed job", async () => {
    const job = {
      id: "a".repeat(64),
      kind: "jetstream.commit.v1",
      source: "jetstream:v2:wss://jetstream.us-west.bsky.network",
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
              ? {
                  job,
                  steps: [],
                  scrobble: { title: "Blue Cheese", artist: "2 Chainz" },
                }
              : { jobs: [job], next: null },
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mock);
    setup("", "jobs");
    await screen.findByText("aaaaaaaaaaaaaa…");
    expect(
      screen.getByText("jetstream.us-west.bsky.network"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "failed" },
    });
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => url.includes("status=failed")),
      ).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("Search scrobble data or job ID"), {
      target: { value: "Blue Cheese" },
    });
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => url.includes("q=Blue+Cheese")),
      ).toBe(true),
    );
    fireEvent.click(await screen.findByText("aaaaaaaaaaaaaa…"));
    await screen.findByText("Retry failed job");
    fireEvent.click(screen.getByText("Retry failed job"));
    expect(mock.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
    expect(screen.getByText("Sign in to retry")).toBeTruthy();
    expect(screen.getByText("Blue Cheese")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Service secret"), {
      target: { value: "test-secret" },
    });
    fireEvent.click(screen.getByText("Sign in"));
    await screen.findByText("Confirm retry");
    expect(JSON.parse(localStorage.getItem("submissions-retry-secret")!)).toBe(
      "test-secret",
    );
    // A new Jotai store represents a full page reload; no credentials supplied.
    cleanup();
    setup(undefined, "jobs");
    fireEvent.click(await screen.findByText("aaaaaaaaaaaaaa…"));
    fireEvent.click(await screen.findByText("Retry failed job"));
    expect(screen.queryByText("Sign in to retry")).toBeNull();
    fireEvent.click(await screen.findByText("Confirm retry"));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, o]) => url.endsWith("/retry") && o?.method === "POST",
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByText("Disconnect"));
    await waitFor(() =>
      expect(localStorage.getItem("submissions-retry-secret")).toBeNull(),
    );
    expect(screen.queryByText("Disconnect")).toBeNull();
  });
});

it("shows floating throughput details on hover and keyboard focus", () => {
  const data = {
    ...overview,
    completions: [
      { minute: overview.as_of, kind: "jetstream.commit.v1", count: 8 },
      { minute: overview.as_of, kind: "scrobble.publish.v1", count: 3 },
    ],
  };
  render(<Chart data={data} />);
  const bar = screen.getByRole("button", {
    name: /Jetstream 8, other 3, total 11/,
  });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(bar);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.textContent).toContain("Jetstream 8");
  expect(tooltip.textContent).toContain("Other jobs 3");
  expect(tooltip.textContent).toContain("Total completed 11");
  expect(bar.getAttribute("aria-describedby")).toBe(tooltip.id);
  fireEvent.mouseLeave(bar);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(bar);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.keyDown(bar, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(bar);
  fireEvent.blur(bar);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("labels v2 cursors as sequences instead of showing a false decades-old lag", async () => {
  const data = {
    ...overview,
    cursors: [
      {
        source: "jetstream:v2:wss://jetstream.us-east.bsky.network",
        cursor_value: 42,
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })),
  );
  setup("test-secret");
  expect(
    await screen.findByText("jetstream.us-east.bsky.network"),
  ).toBeTruthy();
  expect(screen.getByText("Sequence cursor")).toBeTruthy();
  expect(screen.queryByText("since last event")).toBeNull();
});

it("shows processing spans and never invents a runtime for an expired lease", () => {
  render(
    <ProcessingTimeline
      detail={{
        job: {
          id: "a",
          kind: "test",
          status: "completed",
          attempts: 2,
          created_at: 100,
          updated_at: 104,
          available_at: 0,
          lease_until: 0,
          last_error: "",
          compacted_at: 0,
        },
        steps: [],
        attempts: [
          {
            attempt: 1,
            started_at_ms: 101000,
            finished_at_ms: 102000,
            duration_ms: null,
            outcome: "lease_expired",
          },
          {
            attempt: 2,
            started_at_ms: 103000,
            finished_at_ms: 104234,
            duration_ms: 1234,
            outcome: "completed",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Runtime unknown")).toBeTruthy();
  expect(screen.getByText("1.23 s")).toBeTruthy();
  expect(screen.getByText("Attempt 2 · completed")).toBeTruthy();
});
