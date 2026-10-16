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
import {
  App,
  Chart,
  ProcessingTimeline,
  CollectionBreakdown,
  CopyDid,
} from "./App";
import { secretAtom, sectionAtom } from "./state";
import { mergeActivity, type Overview, type LiveActivity } from "./api";
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
const activityFor = (data: Overview): LiveActivity => ({
  as_of: data.as_of, since: Math.floor(data.as_of / 60) * 60 - 60,
  processing: data.counts.filter(c => c.status === "processing"),
  counts: data.counts.filter(c => c.status !== "completed"),
  completed_last_hour: data.completions.reduce((sum, b) => sum + b.count, 0),
  cursors: data.cursors,
  completions: data.completions.filter(b => b.minute >= Math.floor(data.as_of / 60) * 60 - 60),
});
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
      .mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith("/live") ? activityFor(overview) : overview), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    setup();
    await screen.findByText("Queue overview");
    expect(screen.queryByLabelText("Service secret")).toBeNull();
    expect(mock.mock.calls[0][1].headers).toEqual({});
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    expect(document.documentElement.dataset.theme).toBe("rocksky-light");
    fireEvent.click(screen.getByRole("button", { name: "Auto · 2s" }));
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
          url.endsWith("/live")
            ? activityFor(overview)
            : url.includes("/overview")
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
    expect(screen.getByText("jetstream.us-west.bsky.network")).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Filter by queue"), {
      target: { value: "jetstream-v2" },
    });
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => {
          const params = new URL(url, "https://queue.test").searchParams;
          return (
            params.get("jetstream_version") === "v2" &&
            params.get("kind") === "jetstream.commit.v1" &&
            params.get("status") === "failed" &&
            params.get("q") === "Blue Cheese"
          );
        }),
      ).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("Filter by queue"), {
      target: { value: "jetstream-v1" },
    });
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => url.includes("jetstream_version=v1")),
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
      .mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith("/live") ? activityFor(data) : data), { status: 200 })),
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

it("breaks down completed Jetstream jobs without counting publications", () => {
  render(
    <CollectionBreakdown
      data={{
        ...overview,
        completions: [
          {
            minute: 100,
            kind: "jetstream.commit.v1",
            collection: "app.rocksky.scrobble",
            count: 2,
          },
          {
            minute: 160,
            kind: "jetstream.commit.v1",
            collection: "app.rocksky.scrobble",
            count: 1,
          },
          {
            minute: 160,
            kind: "jetstream.commit.v1",
            collection: "app.rocksky.song",
            count: 1,
          },
          { minute: 160, kind: "jetstream.commit.v1", count: 1 },
          { minute: 160, kind: "scrobble.publish.v1", count: 100 },
        ],
      }}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Jetstream collection breakdown" })
      .textContent,
  ).toContain("5 total");
  expect(screen.getByText("app.rocksky.scrobble")).toBeTruthy();
  expect(screen.getByText("60.0%")).toBeTruthy();
  expect(screen.getByText("Unknown / legacy")).toBeTruthy();
  expect(screen.getByText(/before collection tracking/)).toBeTruthy();
});

it("shows an empty collection breakdown when there are no Jetstream completions", () => {
  render(<CollectionBreakdown data={overview} />);
  expect(
    screen.getByText("No completed Jetstream jobs in this window."),
  ).toBeTruthy();
});

it("copies the exact DID and reports clipboard failures", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const did = "did:plc:example";
  const { rerender } = render(<CopyDid value={did} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy DID" }));
  await screen.findByText("Copied");
  expect(writeText).toHaveBeenCalledWith(did);
  rerender(<CopyDid value="did:plc:another" />);
  expect(screen.queryByText("Copied")).toBeNull();
  writeText.mockRejectedValueOnce(new Error("permission denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copy DID" }));
  await screen.findByText("Could not copy. Select the DID to copy manually.");
});


it("replaces cached processing and recent buckets without doubling completions", () => {
  const kind = "jetstream.commit.v1";
  const minute = overview.as_of;
  const snapshot: Overview = {
    ...overview,
    counts: [...overview.counts, { kind, status: "processing", count: 9, oldest_created_at: minute }],
    completions: [
      { kind, minute: minute - 3600, count: 100 },
      { kind, minute: minute - 180, count: 4 },
      { kind, minute: minute - 60, count: 3 },
      { kind, minute, count: 2 },
    ],
  };
  const activity: LiveActivity = { as_of: minute + 5, since: minute - 60, processing: [], counts: [], completed_last_hour: 11, cursors: [{source: "new", cursor_value: 5}], completions: [{kind, minute, count: 7}] };
  const merged = mergeActivity(snapshot, activity);
  expect(merged.counts).toEqual([]);
  expect(merged.completed_last_hour).toBe(11);
  expect(merged.completions.map(b => b.count)).toEqual([4, 7]);
  expect(merged.as_of).toBe(snapshot.as_of);
  expect(merged.live_as_of).toBe(minute + 5);
  expect(merged.cursors).toEqual(activity.cursors);
  expect(mergeActivity(merged, activity)).toEqual(merged);
  expect(mergeActivity(snapshot, {...activity, as_of: minute - 1}).completed_last_hour).toBe(11);
});

it("renders all headline counters from live data instead of cached totals", async () => {
  const activity: LiveActivity = { ...activityFor(overview), as_of: overview.as_of + 5, processing: [{kind: "jetstream.commit.v1", status: "processing", count: 7, oldest_created_at: overview.as_of}], counts: [
    {kind: "jetstream.commit.v1", status: "processing", count: 7, oldest_created_at: overview.as_of},
    {kind: "jetstream.commit.v1", status: "pending", count: 3, oldest_created_at: overview.as_of},
  ], completed_last_hour: 123 };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/live") ? activity : overview), {status: 200})));
  setup();
  await screen.findByText("Active leases · polled every 2s");
  expect(screen.getByText("Processing now").closest(".metric")?.textContent).toContain("7");
  expect(screen.getByText("Waiting in queue").closest(".metric")?.querySelector("strong")?.textContent).toBe("3");
  expect(screen.getByText("Completed · last hour").closest(".metric")?.querySelector("strong")?.textContent).toBe("123");
  expect(screen.getByText(/Counters and activity/)).toBeTruthy();
});
