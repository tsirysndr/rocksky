import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconActivity,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDatabase,
  IconKey,
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
  date,
  duration,
  kindName,
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
  const secret = useAtomValue(secretAtom);
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
      {secret ? <Dashboard /> : <Login />}
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
function Login() {
  const [input, setInput] = useState("");
  const setSecret = useSetAtom(secretAtom);
  const client = useQueryClient();
  const login = useMutation({
    mutationFn: () => api<Overview>("/v1/dashboard/overview", input),
    onSuccess: (data) => {
      client.clear();
      client.setQueryData(["overview"], data);
      setSecret(input);
      setInput("");
    },
  });
  return (
    <div className="login-shell">
      <div className="login-intro">
        <Brand />
        <div className="eyebrow">THE OPERATIONS DESK</div>
        <h1>
          Every scrobble.
          <br />
          <span>Accounted for.</span>
        </h1>
        <p>
          A clear view of the work behind the music.
          <br />
          Monitor deliveries, inspect jobs, and keep things moving.
        </p>
        <div className="login-grid">
          <span>
            <IconDatabase /> Durable by design
          </span>
          <span>
            <IconActivity /> Live queue visibility
          </span>
        </div>
      </div>
      <form
        className="panel login-card"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        <span className="icon-box">
          <IconKey size={25} />
        </span>
        <h2>Connect to your queue</h2>
        <p>
          Enter the submissions service secret to open your operations
          dashboard.
        </p>
        <label className="field-label" htmlFor="secret">
          Service secret
        </label>
        <input
          id="secret"
          type="password"
          autoComplete="off"
          className="input w-full"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          required
          placeholder="Enter your service secret"
        />
        {login.error && <ErrorNote>{login.error.message}</ErrorNote>}
        <button
          className="btn btn-primary w-full"
          disabled={login.isPending || !input.trim()}
        >
          {login.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <>
              Open dashboard <IconArrowRight size={18} />
            </>
          )}
        </button>
        <div className="login-note">
          <IconShieldCheck size={17} />
          <span>
            Your secret stays in memory and is cleared when you disconnect or
            reload.
          </span>
        </div>
      </form>
      <div className="login-footer">
        ROCKSKY INFRASTRUCTURE <span>Built for the flow.</span>
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
      api<Overview>("/v1/dashboard/overview", secret, signal),
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
          <button
            className="nav-item"
            onClick={async () => {
              await client.cancelQueries();
              client.clear();
              setSelected(null);
              setSecret("");
            }}
          >
            <IconLogout size={18} />
            Disconnect
          </button>
          <div className="sidebar-caption">
            A little less waiting.
            <br />A lot more listening.
          </div>
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
              <p>
                {section === "overview"
                  ? "The pulse of your scrobble pipeline, all in one place."
                  : section === "jobs"
                    ? "Follow every delivery from acceptance to completion."
                    : "Keep the queue lean without losing its memory."}
              </p>
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
            <span className="badge badge-ghost">Last 60 minutes</span>
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
              const age = Math.max(0, data.as_of - cursor.cursor_value / 1e6);
              return (
                <div className="cursor-item" key={cursor.source}>
                  <div>
                    <span
                      className={`source-dot ${age > 120 ? "delayed" : ""}`}
                    />
                    <strong>
                      {cursor.source
                        .replace("jetstream:v1:wss://", "")
                        .replace(".bsky.network", "")}
                    </strong>
                  </div>
                  <div className="cursor-age">
                    {duration(age)}
                    <span>since last event</span>
                  </div>
                  <code>{cursor.cursor_value}</code>
                </div>
              );
            })}
          </div>
        )}
      </section>
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
function Chart({ data }: { data: Overview }) {
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
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={`Completed jobs per minute during the last hour. Peak ${max} jobs per minute.`}
      >
        <div className="chart-scale">
          <span>{number(max)}</span>
          <span>{number(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div className="chart-bars">
          {buckets.map((b) => (
            <div
              className="chart-column"
              key={b.minute}
              title={`${date(b.minute)}: Jetstream ${b.jetstream}, other ${b.other}`}
            >
              <div
                className="bar-other"
                style={{ height: `${(b.other / max) * 100}%` }}
              />
              <div
                className="bar-jetstream"
                style={{ height: `${(b.jetstream / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
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
  const secret = useAtomValue(secretAtom);
  const live = useAtomValue(liveAtom);
  const setSelected = useSetAtom(selectedJobAtom);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [id, setId] = useState("");
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const before = pages[pages.length - 1];
  const query = new URLSearchParams({ status, kind, id, limit: "25" });
  if (before) query.set("before", before);
  const jobs = useQuery({
    queryKey: ["jobs", status, kind, id, before],
    queryFn: ({ signal }) =>
      api<JobPage>(`/v1/dashboard/jobs?${query}`, secret, signal),
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
            aria-label="Search full job ID"
            placeholder="Search full job ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            pattern="[a-fA-F0-9]{64}|"
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
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            reset();
          }}
        >
          <option value="">All queues</option>
          <option value="jetstream.commit.v1">Jetstream</option>
          <option value="scrobble.publish.v1">Scrobble publication</option>
        </select>
      </div>
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
                </td>
                <td>
                  <StatusBadge status={job.status} />
                  {job.compacted_at > 0 && <small>Payload compacted</small>}
                </td>
                <td className="mono">{job.attempts}</td>
                <td>{date(job.created_at)}</td>
                <td>{date(job.updated_at)}</td>
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
  const secret = useAtomValue(secretAtom);
  const live = useAtomValue(liveAtom);
  const client = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const detail = useQuery({
    queryKey: ["job", id],
    queryFn: ({ signal }) =>
      api<Detail>(`/v1/dashboard/jobs/${id}`, secret, signal),
    enabled: !!id,
    refetchInterval: live && id ? 5000 : false,
  });
  const retry = useMutation({
    mutationFn: () =>
      api<void>(`/v1/jobs/${id}/retry`, secret, undefined, "POST"),
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
                ["Attempts", job.attempts],
                ["Created", date(job.created_at)],
                ["Updated", date(job.updated_at)],
                ["Available", date(job.available_at)],
                ["Lease expires", date(job.lease_until)],
                ["Payload compacted", date(job.compacted_at)],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {job.last_error && (
              <div className="job-error">
                <h3>Last error</h3>
                <pre>{job.last_error}</pre>
              </div>
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
                {confirm ? (
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
