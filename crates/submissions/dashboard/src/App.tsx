import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { RESET } from "jotai/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconActivity,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDatabase,
  IconLayoutDashboard,
  IconListDetails,
  IconLogout,
  IconMoon,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconSun,
  IconTrash,
  IconX,
  IconAlertCircle,
  IconWaveSine,
} from "@tabler/icons-react";
import {
  api,
  ApiError,
  date,
  duration,
  kindName,
  sourceName,
  number,
  type Detail,
  type JobPage,
  type Overview,
  type Status,
} from "./api";
import {
  liveAtom,
  secretAtom,
  sectionAtom,
  selectedJobAtom,
  themeAtom,
} from "./state";

export function App() {
  const [theme, setTheme] = useAtom(themeAtom);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <>
      <button
        className="btn btn-ghost btn-circle theme-toggle"
        aria-label={`Switch to ${theme === "rocksky-dark" ? "light" : "dark"} mode`}
        onClick={() =>
          setTheme(theme === "rocksky-dark" ? "rocksky-light" : "rocksky-dark")
        }
      >
        {theme === "rocksky-dark" ? (
          <IconSun size={19} />
        ) : (
          <IconMoon size={19} />
        )}
      </button>
      <Dashboard />
    </>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <IconWaveSine size={26} stroke={2.2} />
      </span>
      <div>
        rocksky<span className="brand-sub">SUBMISSIONS</span>
      </div>
    </div>
  );
}
function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="alert alert-error text-sm">
      <IconAlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
function Dashboard() {
  const [secret, setSecret] = useAtom(secretAtom);
  const [section, setSection] = useAtom(sectionAtom);
  const [live, setLive] = useAtom(liveAtom);
  const setSelected = useSetAtom(selectedJobAtom);
  const client = useQueryClient();
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) =>
      api<Overview>("/v1/dashboard/overview", "", signal),
    refetchInterval: live ? 5000 : false,
  });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "overview", label: "Overview", Icon: IconLayoutDashboard },
              { id: "jobs", label: "Job explorer", Icon: IconListDetails },
              { id: "retention", label: "Retention", Icon: IconShieldCheck },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${section === id ? "active" : ""}`}
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {section === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="backend">
            <IconDatabase size={19} />
            <div>
              {overview.data?.backend || "Connecting"}
              <small>Durable queue storage</small>
            </div>
          </div>
          {secret && (
            <button
              className="nav-item"
              onClick={async () => {
                await client.cancelQueries();
                client.clear();
                setSelected(null);
                setSecret(RESET);
              }}
            >
              <IconLogout size={18} />
              Disconnect
            </button>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <IconChevronRight size={14} />
            <span>Submissions</span>
          </div>
          <div className="topbar-right">
            <span className={`connection ${overview.isError ? "bad" : ""}`}>
              <i />
              {overview.isError
                ? "Connection issue"
                : overview.data
                  ? "Connected"
                  : "Connecting"}
            </span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">SUBMISSIONS SERVICE</div>
              <h1>
                {section === "overview"
                  ? "Queue overview"
                  : section === "jobs"
                    ? "Job explorer"
                    : "Retention & cleanup"}
              </h1>
              {section !== "overview" && (
                <p>
                  {section === "jobs"
                    ? "Follow every delivery from acceptance to completion."
                    : "Keep the queue lean without losing its memory."}
                </p>
              )}
            </div>
            <div className="page-actions">
              <button
                className={`btn btn-sm ${live ? "live-button" : "btn-ghost"}`}
                onClick={() => setLive(!live)}
              >
                {live ? (
                  <IconPlayerPause size={14} />
                ) : (
                  <IconPlayerPlay size={14} />
                )}
                {live ? "Live · 5s" : "Paused"}
              </button>
              <button
                className="btn btn-sm btn-outline"
                aria-label="Refresh dashboard"
                onClick={() => client.invalidateQueries()}
                disabled={overview.isFetching}
              >
                <IconRefresh
                  size={16}
                  className={overview.isFetching ? "spinning" : ""}
                />
                Refresh
              </button>
            </div>
          </div>
          {overview.isError && (
            <ErrorNote>
              {overview.error.message} Displayed data may be stale.
            </ErrorNote>
          )}
          {!overview.data && overview.isPending ? (
            <div role="status" className="loading-state">
              <span className="loading loading-spinner" />
              Connecting to the queue…
            </div>
          ) : (
            overview.data && (
              <>
                {section === "overview" && (
                  <OverviewView data={overview.data} />
                )}
                {section === "retention" && <Retention data={overview.data} />}
              </>
            )
          )}
          {section === "jobs" && <Jobs />}
          <footer className="content-footer">
            <span>
              <IconShieldCheck size={14} /> Durable acceptance. Recoverable
              work.
            </span>
            <span>
              {overview.data
                ? `Snapshot ${date(overview.data.as_of)}`
                : "Waiting for first snapshot"}
            </span>
          </footer>
        </div>
      </main>
      <JobDialog />
    </div>
  );
}
function OverviewView({ data }: { data: Overview }) {
  const setSection = useSetAtom(sectionAtom);
  const total = (status: Status) =>
    data.counts
      .filter((c) => c.status === status)
      .reduce((sum, c) => sum + c.count, 0);
  const pending = data.counts.filter((c) => c.status === "pending");
  const oldest = pending.length
    ? data.as_of - Math.min(...pending.map((c) => c.oldest_created_at))
    : 0;
  const done = data.completions.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <>
      <div className="metrics">
        {[
          {
            label: "Waiting in queue",
            value: total("pending"),
            note: oldest
              ? `Oldest waiting ${duration(oldest)}`
              : "No waiting jobs",
            Icon: IconClock,
            color: "amber",
          },
          {
            label: "Processing now",
            value: total("processing"),
            note: "Jobs with an active lease",
            Icon: IconActivity,
            color: "blue",
          },
          {
            label: "Completed · last hour",
            value: done,
            note: "Across all queue types",
            Icon: IconCheck,
            color: "green",
          },
          {
            label: "Needs attention",
            value: total("failed"),
            note: total("failed")
              ? "Inspect failures in Job explorer"
              : "No failed jobs",
            Icon: IconAlertCircle,
            color: "red",
          },
        ].map(({ label, value, note, Icon, color }) => (
          <div className="panel metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className={`metric-icon ${color}`}>
                <Icon size={18} />
              </span>
            </div>
            <strong>{number(value)}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel throughput">
          <div className="panel-heading">
            <div>
              <h2>Delivery activity</h2>
              <p>Completed jobs per minute</p>
            </div>
            <span className="badge badge-ghost">
              Last <span className="mono">60</span> minutes
            </span>
          </div>
          <Chart data={data} />
          <div className="chart-legend">
            <span>
              <i className="jetstream-key" />
              Jetstream
            </span>
            <span>
              <i className="publication-key" />
              Publication / other
            </span>
          </div>
        </section>
        <section className="panel pipeline">
          <div className="panel-heading">
            <div>
              <h2>Pipeline health</h2>
              <p>Live work by queue</p>
            </div>
            <IconActivity size={20} />
          </div>
          {[
            ...new Set([
              "jetstream.commit.v1",
              "scrobble.publish.v1",
              ...data.counts.map((c) => c.kind),
            ]),
          ].map((kind) => {
            const counts = data.counts.filter((c) => c.kind === kind);
            const active = counts
              .filter((c) => c.status !== "completed")
              .reduce((sum, c) => sum + c.count, 0);
            return (
              <div className="pipeline-item" key={kind}>
                <div className="pipeline-title">
                  <span className="icon-box small">
                    {kind.startsWith("jetstream") ? (
                      <IconArrowDownLeft size={18} />
                    ) : (
                      <IconArrowUpRight size={18} />
                    )}
                  </span>
                  <strong>{kindName(kind)}</strong>
                </div>
                <div className="pipeline-numbers">
                  {(["pending", "processing", "failed"] as const).map(
                    (status) => (
                      <div key={status}>
                        <strong>
                          {number(
                            counts.find((c) => c.status === status)?.count || 0,
                          )}
                        </strong>
                        <span>{status === "pending" ? "waiting" : status}</span>
                      </div>
                    ),
                  )}
                </div>
                <div className="pipeline-track">
                  {(["pending", "processing", "failed"] as const).map(
                    (status) => (
                      <span
                        className={status}
                        key={status}
                        style={{
                          width: `${active ? ((counts.find((c) => c.status === status)?.count || 0) / active) * 100 : 0}%`,
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
            );
          })}
          <button className="text-link" onClick={() => setSection("jobs")}>
            Explore all jobs <IconArrowRight size={16} />
          </button>
        </section>
      </div>
      <section className="panel cursors">
        <div className="panel-heading">
          <div>
            <h2>Jetstream connections</h2>
            <p>
              Last captured event per source. An idle source can show age
              without a backlog.
            </p>
          </div>
          <span className="badge badge-ghost">
            {data.cursors.length} sources
          </span>
        </div>
        {data.cursors.length === 0 ? (
          <div className="empty-inline">
            No source cursors yet. They appear when Jetstream captures its first
            event.
          </div>
        ) : (
          <div className="cursor-grid">
            {data.cursors.map((cursor) => {
              const isV2 = cursor.source.startsWith("jetstream:v2:");
              const age = isV2
                ? 0
                : Math.max(0, data.as_of - cursor.cursor_value / 1e6);
              return (
                <div className="cursor-item" key={cursor.source}>
                  <div>
                    <span
                      className={`source-dot ${age > 120 ? "delayed" : ""}`}
                    />
                    <strong className="mono">
                      {sourceName(cursor.source)}
                    </strong>
                  </div>
                  <div className="cursor-age">
                    {isV2 ? "Sequence cursor" : duration(age)}
                    <span>
                      {isV2 ? "Per-source resume position" : "since last event"}
                    </span>
                  </div>
                  <code>{cursor.cursor_value}</code>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <CollectionBreakdown data={data} />
      <div className="retention-strip">
        <IconShieldCheck size={21} />
        <div>
          <strong>
            {data.cleanup.enabled
              ? "Automatic cleanup is enabled"
              : "Automatic cleanup is disabled"}
          </strong>
          <span>
            {data.cleanup.enabled
              ? `Payloads retained ${duration(data.cleanup.completed_retention_seconds)} · Deduplication ${data.cleanup.dedup_retention_seconds ? duration(data.cleanup.dedup_retention_seconds) : "forever"}`
              : "Completed records are retained until cleanup is enabled."}
          </span>
        </div>
        <button className="text-link" onClick={() => setSection("retention")}>
          View policy <IconArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
export function CollectionBreakdown({ data }: { data: Overview }) {
  const counts = new Map<string, number>();
  for (const bucket of data.completions) {
    if (bucket.kind !== "jetstream.commit.v1") continue;
    const collection = bucket.collection || "";
    counts.set(collection, (counts.get(collection) ?? 0) + bucket.count);
  }
  const rows = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return (
    <section
      className="panel collection-breakdown"
      aria-label="Jetstream collection breakdown"
    >
      <div className="panel-heading">
        <div>
          <h2>Jetstream collections</h2>
          <p>
            Completed jobs in the last <span className="mono">60</span> minutes
            · <span className="mono">{number(total)}</span> total
          </p>
        </div>
      </div>
      <p className="collection-note">
        Record changes, not unique listens. Includes creates, updates, deletes
        and successful skips. Duplicate feed deliveries count once while
        retained.
      </p>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Completed jobs</th>
                <th>Share of Jetstream</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([collection, count]) => (
                <tr key={collection}>
                  <td>
                    <code>{collection || "Unknown / legacy"}</code>
                  </td>
                  <td className="mono">{number(count)}</td>
                  <td>
                    <div className="collection-share">
                      <progress
                        className="progress progress-primary"
                        value={count}
                        max={total}
                        aria-label={`${collection || "Unknown / legacy"} share`}
                      />
                      <span>{((count / total) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="collection-note">
          No completed Jetstream jobs in this window.
        </p>
      )}
      {counts.has("") && (
        <p className="collection-note">
          Unknown / legacy includes jobs captured before collection tracking was
          enabled or without valid collection metadata.
        </p>
      )}
    </section>
  );
}

export function Chart({ data }: { data: Overview }) {
  const tooltipId = useId();
  const [hover, setHover] = useState<{
    minute: number;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  const show = (minute: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const below = rect.top < 160;
    setHover({
      minute,
      x: Math.max(
        120,
        Math.min(window.innerWidth - 120, rect.left + rect.width / 2),
      ),
      y: below ? rect.bottom + 12 : rect.top - 12,
      below,
    });
  };
  const end = Math.floor(data.as_of / 60) * 60;
  const buckets = Array.from({ length: 60 }, (_, i) => {
    const minute = end - (59 - i) * 60;
    const values = data.completions.filter((b) => b.minute === minute);
    return {
      minute,
      jetstream: values
        .filter((b) => b.kind === "jetstream.commit.v1")
        .reduce((s, b) => s + b.count, 0),
      other: values
        .filter((b) => b.kind !== "jetstream.commit.v1")
        .reduce((s, b) => s + b.count, 0),
    };
  });
  const max = Math.max(1, ...buckets.map((b) => b.jetstream + b.other));
  const active = hover && buckets.find((b) => b.minute === hover.minute);
  return (
    <>
      <div
        className="chart"
        role="group"
        aria-label={`Completed jobs per minute during the last hour. Peak ${max} jobs per minute.`}
      >
        <div className="chart-scale">
          <span>{number(max)}</span>
          <span>{number(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div className="chart-bars">
          {buckets.map((b) => (
            <button
              type="button"
              className="chart-column"
              key={b.minute}
              aria-label={`${date(b.minute)}: Jetstream ${b.jetstream}, other ${b.other}, total ${b.jetstream + b.other}`}
              aria-describedby={
                hover?.minute === b.minute ? tooltipId : undefined
              }
              onMouseEnter={(event) => show(b.minute, event.currentTarget)}
              onMouseLeave={() => setHover(null)}
              onFocus={(event) => show(b.minute, event.currentTarget)}
              onBlur={() => setHover(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setHover(null);
              }}
            >
              <div
                className="bar-other"
                style={{ height: `${(b.other / max) * 100}%` }}
              />
              <div
                className="bar-jetstream"
                style={{ height: `${(b.jetstream / max) * 100}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      {hover &&
        active &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="chart-tooltip"
            style={{
              left: hover.x,
              top: hover.y,
              transform: hover.below
                ? "translateX(-50%)"
                : "translate(-50%, -100%)",
            }}
          >
            <strong>{date(active.minute)}</strong>
            <span>
              Jetstream <b>{number(active.jetstream)}</b>
            </span>
            <span>
              Other jobs <b>{number(active.other)}</b>
            </span>
            <span className="tooltip-total">
              Total completed <b>{number(active.jetstream + active.other)}</b>
            </span>
          </div>,
          document.body,
        )}
      <div className="chart-axis">
        <span>60 min ago</span>
        <span>30 min ago</span>
        <span>Now</span>
      </div>
    </>
  );
}
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge ${status}`}>
      <i />
      {status}
    </span>
  );
}
function Jobs() {
  const live = useAtomValue(liveAtom);
  const setSelected = useSetAtom(selectedJobAtom);
  const [status, setStatus] = useState("");
  const [queue, setQueue] = useState("");
  const jetstreamVersion =
    queue === "jetstream-v1" ? "v1" : queue === "jetstream-v2" ? "v2" : "";
  const kind = jetstreamVersion ? "jetstream.commit.v1" : queue;
  const [search, setSearch] = useState("");
  const [id, setId] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setId(search.trim());
      setPages([null]);
    }, 180);
    return () => clearTimeout(timer);
  }, [search]);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const before = pages[pages.length - 1];
  const query = new URLSearchParams({
    status,
    kind,
    jetstream_version: jetstreamVersion,
    limit: "25",
  });
  query.set(/^[a-fA-F0-9]{64}$/.test(id) ? "id" : "q", id);
  if (before) query.set("before", before);
  const jobs = useQuery({
    queryKey: ["jobs", status, kind, jetstreamVersion, id, before],
    queryFn: ({ signal }) =>
      api<JobPage>(`/v1/dashboard/jobs?${query}`, "", signal),
    refetchInterval: live ? 5000 : false,
  });
  const reset = () => setPages([null]);
  return (
    <section className="panel jobs-panel">
      <div className="jobs-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setId(search.trim());
            reset();
          }}
          className="search"
        >
          <IconSearch size={18} />
          <input
            aria-label="Search scrobble data or job ID"
            placeholder="Song, artist, album, DID or job ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
          />
          <button className="btn btn-ghost btn-xs" type="submit">
            Search
          </button>
          {id && (
            <button
              className="btn btn-ghost btn-xs"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                setId("");
                reset();
              }}
            >
              <IconX size={14} />
            </button>
          )}
        </form>
        <select
          className="select select-sm"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            reset();
          }}
        >
          <option value="">All statuses</option>
          {["pending", "processing", "completed", "failed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="select select-sm"
          aria-label="Filter by queue"
          value={queue}
          onChange={(e) => {
            setQueue(e.target.value);
            reset();
          }}
        >
          <option value="">All queues</option>
          <option value="jetstream.commit.v1">Jetstream · All versions</option>
          <option value="jetstream-v1">Jetstream v1</option>
          <option value="jetstream-v2">Jetstream v2</option>
          <option value="scrobble.publish.v1">Scrobble publication</option>
          <option value="tealfm.publish.v1">Teal FM publication</option>
        </select>
      </div>
      <p className="muted search-scope">
        Instant search across the newest 2,000 jobs. Compacted scrobble data is
        no longer searchable.
      </p>
      {jobs.error && <ErrorNote>{jobs.error.message}</ErrorNote>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Job / queue</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Created</th>
              <th>Last update</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.data?.jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <button
                    className="job-id"
                    onClick={() => setSelected(job.id)}
                    title={job.id}
                  >
                    {job.id.slice(0, 14)}…
                  </button>
                  <small>{kindName(job.kind)}</small>
                  {job.kind.startsWith("jetstream.") && (
                    <small className="source-label">
                      {sourceName(job.source)}
                    </small>
                  )}
                </td>
                <td>
                  <StatusBadge status={job.status} />
                  {job.compacted_at > 0 && <small>Payload compacted</small>}
                </td>
                <td className="mono">{job.attempts}</td>
                <td className="mono">{date(job.created_at)}</td>
                <td className="mono">{date(job.updated_at)}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-circle btn-sm"
                    aria-label={`Inspect job ${job.id}`}
                    onClick={() => setSelected(job.id)}
                  >
                    <IconChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {jobs.isPending && (
        <div className="loading-state">
          <span className="loading loading-spinner loading-sm" />
          Loading jobs…
        </div>
      )}
      {jobs.data?.jobs.length === 0 && (
        <div className="empty-state">
          <IconListDetails size={32} />
          <h3>No jobs found</h3>
          <p>Try another filter or wait for new submissions.</p>
        </div>
      )}
      <div className="table-footer">
        <span>
          Newest accepted first · Page {pages.length}
          {jobs.isFetching ? " · Updating…" : ""}
        </span>
        <div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pages.length === 1 || jobs.isFetching}
            onClick={() => setPages((p) => p.slice(0, -1))}
          >
            <IconChevronLeft size={16} />
            Previous
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!jobs.data?.next || jobs.isFetching}
            onClick={() => setPages((p) => [...p, jobs.data!.next])}
          >
            Next
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
function JobDialog() {
  const [id, setId] = useAtom(selectedJobAtom);
  const live = useAtomValue(liveAtom);
  const client = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [secret, setSecret] = useAtom(secretAtom);
  const [input, setInput] = useState("");
  const login = useMutation({
    mutationFn: () => api(`/v1/jobs/${id}`, input),
    onSuccess: () => {
      setSecret(input);
      setInput("");
    },
  });
  const detail = useQuery({
    queryKey: ["job", id],
    queryFn: ({ signal }) =>
      api<Detail>(`/v1/dashboard/jobs/${id}`, "", signal),
    enabled: !!id,
    refetchInterval: live && id ? 5000 : false,
  });
  const retry = useMutation({
    mutationFn: () =>
      api<void>(`/v1/jobs/${id}/retry`, secret, undefined, "POST"),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) setSecret(RESET);
    },
    onSuccess: () => {
      setConfirm(false);
      client.invalidateQueries({ queryKey: ["job", id] });
      client.invalidateQueries({ queryKey: ["jobs"] });
      client.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  useEffect(() => {
    if (id) {
      ref.current?.showModal();
      setConfirm(false);
      retry.reset();
      login.reset();
      setInput("");
    } else ref.current?.close();
  }, [id]);
  const job = detail.data?.job;
  return (
    <dialog ref={ref} className="modal" onClose={() => setId(null)}>
      <div className="modal-box job-modal">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">DELIVERY DETAILS</div>
            <h2>Inspect job</h2>
          </div>
          <button
            className="btn btn-ghost btn-circle btn-sm"
            aria-label="Close job details"
            onClick={() => setId(null)}
          >
            <IconX />
          </button>
        </div>
        {detail.isPending && <span className="loading loading-spinner" />}
        {detail.error && <ErrorNote>{detail.error.message}</ErrorNote>}
        {job && (
          <>
            <code className="full-id">{job.id}</code>
            <div className="detail-status">
              <StatusBadge status={job.status} />
              <span>{kindName(job.kind)}</span>
            </div>
            <dl className="detail-grid">
              {[
                ...(job.kind.startsWith("jetstream.")
                  ? [["Captured by", sourceName(job.source)]]
                  : []),
                ["Attempts", job.attempts],
                ["Created", date(job.created_at)],
                ["Updated", date(job.updated_at)],
                ["Available", date(job.available_at)],
                ["Lease expires", date(job.lease_until)],
                ["Payload compacted", date(job.compacted_at)],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd className="mono">{value}</dd>
                </div>
              ))}
            </dl>
            {job.last_error && (
              <div className="job-error">
                <h3>Last error</h3>
                <pre>{job.last_error}</pre>
              </div>
            )}
            {detail.data && <ProcessingTimeline detail={detail.data} />}
            <h3 className="section-title">Scrobble data</h3>
            {detail.data?.scrobble &&
            Object.keys(detail.data.scrobble).length ? (
              <dl className="detail-grid scrobble-data">
                {Object.entries(detail.data.scrobble).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd
                      className={
                        typeof value === "number" ||
                        [
                          "did",
                          "recordKey",
                          "mbId",
                          "mbid",
                          "isrc",
                          "createdAt",
                          "timestamp",
                          "releaseDate",
                          "year",
                          "trackNumber",
                          "discNumber",
                          "duration",
                        ].includes(key)
                          ? "mono"
                          : undefined
                      }
                    >
                      {key === "did" && typeof value === "string" ? (
                        <CopyDid value={value} />
                      ) : (
                        String(value ?? "—")
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">
                {job.compacted_at
                  ? "Scrobble data was removed by retention cleanup."
                  : "No scrobble metadata available."}
              </p>
            )}
            <h3 className="section-title">Durable checkpoints</h3>
            {detail.data?.steps.length ? (
              <ul className="checkpoints">
                {detail.data.steps.map((step) => (
                  <li key={step.name}>
                    <IconCheck size={17} />
                    <div>
                      <code>{step.name}</code>
                      <small>{date(step.completed_at)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No checkpoints recorded yet.</p>
            )}
            {retry.error && <ErrorNote>{retry.error.message}</ErrorNote>}
            {retry.isSuccess && (
              <div role="status" className="alert alert-success">
                Job requeued successfully.
              </div>
            )}
            {job.status === "failed" && (
              <div className="retry-box">
                {confirm && !secret ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      login.mutate();
                    }}
                  >
                    <h3>Sign in to retry</h3>
                    <p>
                      Enter the submissions service secret. Retry access is
                      saved in this browser until you click Disconnect.
                    </p>
                    <label htmlFor="retry-secret">Service secret</label>
                    <input
                      id="retry-secret"
                      type="password"
                      className="input w-full"
                      autoComplete="off"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      required
                    />
                    {login.error && (
                      <ErrorNote>{login.error.message}</ErrorNote>
                    )}
                    <button
                      className="btn btn-primary"
                      disabled={login.isPending || !input.trim()}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setConfirm(false);
                        setInput("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : confirm ? (
                  <>
                    <p>
                      Retry this failed job? Attempts reset to zero. Completed
                      checkpoints remain intact.
                    </p>
                    <div>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setConfirm(false)}
                        disabled={retry.isPending}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate()}
                      >
                        {retry.isPending ? "Requeuing…" : "Confirm retry"}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => setConfirm(true)}
                  >
                    <IconRefresh size={17} />
                    Retry failed job
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>Close</button>
      </form>
    </dialog>
  );
}

export function CopyDid({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    setState("idle");
  }, [value]);
  return (
    <span className="copy-did">
      <span className="mono">{value}</span>
      <button
        type="button"
        className="btn btn-ghost btn-circle btn-xs"
        aria-label="Copy DID"
        title="Copy DID"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? <IconCheck size={15} /> : <IconCopy size={15} />}
      </button>
      <span className="copy-feedback" role="status">
        {state === "copied"
          ? "Copied"
          : state === "error"
            ? "Could not copy. Select the DID to copy manually."
            : ""}
      </span>
    </span>
  );
}

export function ProcessingTimeline({ detail }: { detail: Detail }) {
  const [now, setNow] = useState(Date.now());
  const { job } = detail;
  useEffect(() => {
    if (job.status !== "processing") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.status]);
  const spans = [...(detail.attempts ?? [])];
  if (job.status === "processing" && job.started_at_ms)
    spans.push({
      attempt: job.attempts,
      started_at_ms: job.started_at_ms,
      finished_at_ms: now,
      duration_ms: null,
      outcome: "in progress",
    });
  const start = spans.length
    ? Math.min(job.created_at * 1000, ...spans.map((s) => s.started_at_ms))
    : 0;
  const end = Math.max(start + 1, ...spans.map((s) => s.finished_at_ms));
  const ms = (value: number) =>
    value < 1000
      ? `${Math.max(0, value)} ms`
      : `${(value / 1000).toFixed(2)} s`;
  return (
    <section className="processing-timeline">
      <h3 className="section-title">Processing timeline</h3>
      <p className="muted">
        Wall time from claim to outcome, including worker and database waits.
        Gaps represent queue or retry waits.
      </p>
      {!spans.length ? (
        <p className="muted">
          {job.compacted_at
            ? "Attempt history was removed by retention cleanup."
            : "Timing is recorded for attempts started after this update."}
        </p>
      ) : (
        <>
          <p>
            Initial queue wait:{" "}
            {ms(Math.max(0, spans[0].started_at_ms - job.created_at * 1000))}{" "}
            <small>(creation time has second precision)</small>
          </p>
          {spans.map((span, i) => (
            <div className="attempt-span" key={i}>
              <div className="span-caption">
                <span>
                  Attempt {span.attempt} · {span.outcome.replaceAll("_", " ")}
                </span>
                <strong>
                  {span.duration_ms !== null
                    ? ms(span.duration_ms)
                    : span.outcome === "in progress"
                      ? `${ms(Math.max(0, now - span.started_at_ms))} elapsed`
                      : "Runtime unknown"}
                </strong>
              </div>
              <div className="span-track">
                <div
                  className={`span-bar ${span.outcome}`}
                  style={{
                    marginLeft: `${Math.max(0, ((span.started_at_ms - start) / (end - start)) * 100)}%`,
                    width: `${Math.max(0, ((span.finished_at_ms - span.started_at_ms) / (end - start)) * 100)}%`,
                  }}
                  title={`${new Date(span.started_at_ms).toLocaleString()} → ${new Date(span.finished_at_ms).toLocaleString()}`}
                />
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Retention({ data }: { data: Overview }) {
  const c = data.cleanup;
  return (
    <>
      <div className="retention-heading panel">
        <span className="icon-box">
          <IconShieldCheck size={27} />
        </span>
        <div>
          <h2>{c.enabled ? "Cleanup is on" : "Cleanup is off"}</h2>
          <p>
            Completed jobs are compacted first, then expired according to the
            deduplication window.
          </p>
        </div>
        <span
          className={`badge ${c.enabled ? "badge-success" : "badge-warning"}`}
        >
          {c.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div className="retention-cards">
        {[
          {
            Icon: IconDatabase,
            title: "Keep the details",
            value: duration(c.completed_retention_seconds),
            text: "Completed payloads and checkpoints remain available for this long.",
          },
          {
            Icon: IconShieldCheck,
            title: "Remember the delivery",
            value: c.dedup_retention_seconds
              ? duration(c.dedup_retention_seconds)
              : "Forever",
            text: "Deduplication is retained from completion. After expiry, the same key can be accepted again.",
          },
          {
            Icon: IconTrash,
            title: "Clean up in small batches",
            value: `${number(c.batch_size)} jobs`,
            text: `Each phase handles at most this many jobs every ${duration(c.interval_seconds)}.`,
          },
        ].map(({ Icon, title, value, text }) => (
          <article className="panel retention-card" key={title}>
            <Icon size={24} />
            <h3>{title}</h3>
            <strong>{value}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <section className="panel policy-notes">
        <h2>What stays protected</h2>
        <p>
          Pending, processing, and failed jobs are never removed by automatic
          cleanup. Source cursors are retained. Compaction preserves the job
          identity, completion status, and request fingerprint.
        </p>
        <div className="policy-divider" />
        <h3>Configured on the service</h3>
        <p>
          Manage the <code>SUBMISSIONS_CLEANUP_*</code>,{" "}
          <code>SUBMISSIONS_COMPLETED_RETENTION_SECONDS</code>, and{" "}
          <code>SUBMISSIONS_DEDUP_RETENTION_SECONDS</code> environment variables
          in Doppler, then restart the service.
        </p>
        <p className="muted">
          Database space is reused after cleanup; the database file may not
          shrink immediately. Retained completed totals refresh every 60
          seconds.
        </p>
        <div className="retained-total">
          {number(
            data.counts
              .filter((c) => c.status === "completed")
              .reduce((s, c) => s + c.count, 0),
          )}
          <span>completed jobs retained</span>
        </div>
      </section>
    </>
  );
}
