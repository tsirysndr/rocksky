import { useEffect, useRef, useState } from "react";
import Main from "../../layouts/Main";
import { useNavigate } from "@tanstack/react-router";
import {
  type ImportJob,
  cancelImport,
  getImportJobs,
  getImportStatus,
  uploadImportFile,
} from "../../api/import";
import { API_URL } from "../../consts";
import { Spinner } from "baseui/spinner";
import dayjs from "dayjs";
import {
  IconCheck,
  IconX,
  IconHistory,
  IconFileTypeCsv,
  IconBraces,
  IconMusic,
  IconCloudUpload,
} from "@tabler/icons-react";

function BigProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-[var(--color-menu-hover)] rounded-full h-3 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(to right, var(--color-primary), #ff6ba8)",
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ImportJob["status"] }) {
  const map: Record<ImportJob["status"], { label: string; cls: string }> = {
    pending:   { label: "Pending",   cls: "bg-yellow-500/15 text-yellow-500" },
    running:   { label: "Running",   cls: "bg-blue-400/15 text-blue-400"     },
    completed: { label: "Completed", cls: "bg-green-500/15 text-green-500"   },
    failed:    { label: "Failed",    cls: "bg-red-500/15 text-red-500"       },
    cancelled: { label: "Cancelled", cls: "bg-[var(--color-menu-hover)] text-[var(--color-text-muted)]" },
  };
  const { label, cls } = map[status] ?? map.failed;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function ActiveJobCard({ job, onCancel }: { job: ImportJob; onCancel: () => void }) {
  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
  const errors: string[] = job.errors ? JSON.parse(job.errors) : [];
  const isLastFm = job.type === "lastfm";

  return (
    <div className="rounded-2xl overflow-hidden mb-8">
      <div className={`h-1 w-full ${isLastFm ? "bg-red-500" : "bg-green-500"}`} />
      <div className="px-10 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {job.status === "running" && <Spinner $color="rgb(96,165,250)" $size="scale600" />}
            {job.status === "completed" && (
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <IconCheck size={14} className="text-green-500" />
              </div>
            )}
            {(job.status === "failed" || job.status === "cancelled") && (
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <IconX size={14} className="text-red-500" />
              </div>
            )}
            <span
              className="text-[var(--color-text)] font-semibold text-base ml-4"
              style={{ fontFamily: "RockfordSansMedium" }}
            >
              {isLastFm ? "Last.fm" : "Spotify"} Import
            </span>
          </div>
          <div className="flex items-center gap-3">
            {job.status === "running" && (
              <button
                onClick={onCancel}
                className="text-xs text-red-500 hover:text-red-400 cursor-pointer bg-transparent transition-colors"
                style={{ fontFamily: "RockfordSansMedium" }}
              >
                Cancel
              </button>
            )}
            <StatusBadge status={job.status} />
          </div>
        </div>

        <BigProgressBar value={job.processed} max={job.total} />

        <div className="flex items-end justify-between mt-3">
          <span className="text-sm text-[var(--color-text-muted)]">
            <span className="text-[var(--color-text)] font-medium">
              {job.processed.toLocaleString()}
            </span>{" "}
            / {job.total.toLocaleString()} scrobbles
          </span>
          <span
            className="text-3xl text-[var(--color-text)] leading-none"
            style={{ fontFamily: "RockfordSansBold" }}
          >
            {pct}%
          </span>
        </div>

        {job.status === "running" && job.currentTrack && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--color-menu-hover)]">
            <IconMusic size={13} className="text-[var(--color-primary)] flex-shrink-0" />
            <span className="text-xs text-[var(--color-text-muted)] truncate">
              {job.currentTrack}
            </span>
          </div>
        )}

        {job.failed > 0 && (
          <p className="text-xs text-red-400 mt-3">
            {job.failed.toLocaleString()} tracks failed to import
          </p>
        )}

        {errors.length > 0 && job.status === "failed" && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 text-xs space-y-1 max-h-32 overflow-y-auto">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        {errors.length > 0 && job.status !== "failed" && (
          <details className="mt-3">
            <summary className="text-xs text-[var(--color-text-muted)] cursor-pointer">
              Show errors ({errors.length})
            </summary>
            <ul className="mt-2 text-xs text-red-400 max-h-28 overflow-y-auto space-y-1">
              {errors.map((e, i) => <li key={i} className="truncate">{e}</li>)}
            </ul>
          </details>
        )}

        <p className="text-xs text-[var(--color-text-muted)] mt-4">
          Started {dayjs(job.createdAt).format("MMM D, YYYY [at] HH:mm")}
          {job.status !== "running" &&
            ` · Ended ${dayjs(job.updatedAt).format("HH:mm")}`}
        </p>
      </div>
    </div>
  );
}

function SourceCard({
  type,
  activeJob,
  uploading,
  onUpload,
  error,
}: {
  type: "lastfm" | "spotify";
  activeJob: ImportJob | null;
  uploading?: boolean;
  onUpload: (file: File, type: "lastfm" | "spotify") => void;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const isLastFm = type === "lastfm";
  const isRunning = activeJob?.status === "running" || !!uploading;
  const accept = isLastFm ? ".csv,text/csv" : ".json,application/json";

  const handleFile = (file: File) => {
    if (isRunning) return;
    onUpload(file, type);
  };

  return (
    <div className="rounded-2xl overflow-hidden">
      <div className={`h-1 w-full ${isLastFm ? "bg-red-500" : "bg-green-500"}`} />

      <div className="p-6">
        {/* Header */}
        <div className="mb-4">
          <h3
            className="text-[var(--color-text)] font-semibold text-base leading-tight"
            style={{ fontFamily: "RockfordSansMedium" }}
          >
            {isLastFm ? "Last.fm CSV" : "Spotify History"}
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {isLastFm
              ? "Import your full scrobble history"
              : "Import from your Spotify data export"}
          </p>
        </div>

        {/* Instructions */}
        <ol className="space-y-2 mb-5">
          {isLastFm ? (
            <>
              <li className="flex gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-primary)] font-bold flex-shrink-0 w-3">1.</span>
                <span>
                  Go to{" "}
                  <a
                    href="https://lastfm.ghan.nl/export/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] underline"
                  >
                    lastfm.ghan.nl/export
                  </a>
                </span>
              </li>
              <li className="flex gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-primary)] font-bold flex-shrink-0 w-3">2.</span>
                <span>Enter your username and export your scrobbles</span>
              </li>
              <li className="flex gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-primary)] font-bold flex-shrink-0 w-3">3.</span>
                <span>
                  Upload the{" "}
                  <code className="bg-[var(--color-menu-hover)] px-1 rounded">.csv</code>{" "}
                  file below
                </span>
              </li>
            </>
          ) : (
            <>
              <li className="flex gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-primary)] font-bold flex-shrink-0 w-3">1.</span>
                <span>
                  Go to{" "}
                  <a
                    href="https://www.spotify.com/account/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] underline"
                  >
                    spotify.com/account/privacy
                  </a>{" "}
                  and request your data
                </span>
              </li>
              <li className="flex gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-primary)] font-bold flex-shrink-0 w-3">2.</span>
                <span>Wait for the email archive (can take a few days)</span>
              </li>
              <li className="flex gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-primary)] font-bold flex-shrink-0 w-3">3.</span>
                <span>
                  Upload a{" "}
                  <code className="bg-[var(--color-menu-hover)] px-1 rounded">
                    StreamingHistory_music_*.json
                  </code>{" "}
                  or{" "}
                  <code className="bg-[var(--color-menu-hover)] px-1 rounded">
                    Endsong_*.json
                  </code>{" "}
                  file
                </span>
              </li>
            </>
          )}
        </ol>

        {/* Drop zone */}
        <div
          className={`rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all ${
            dragging ? "bg-[var(--color-primary)]/10" : ""
          } ${
            isRunning
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer hover:bg-[var(--color-primary)]/5"
          }`}
          onClick={() => !isRunning && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isRunning) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          {uploading ? (
            <>
              <Spinner $color="var(--color-primary)" $size="scale700" />
              <p
                className="text-sm text-[var(--color-text)]"
                style={{ fontFamily: "RockfordSansMedium" }}
              >
                Uploading…
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Parsing and queuing scrobbles
              </p>
            </>
          ) : isRunning ? (
            <>
              <IconCloudUpload size={24} className="text-[var(--color-text-muted)]" />
              <p className="text-sm text-[var(--color-text-muted)]">
                Import in progress…
              </p>
            </>
          ) : (
            <>
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  isLastFm ? "bg-red-500/10" : "bg-green-500/10"
                }`}
              >
                {isLastFm ? (
                  <IconFileTypeCsv
                    size={22}
                    className="text-red-500"
                  />
                ) : (
                  <IconBraces size={22} className="text-green-500" />
                )}
              </div>
              <p
                className="text-sm text-[var(--color-text)]"
                style={{ fontFamily: "RockfordSansMedium" }}
              >
                Drop {isLastFm ? "CSV" : "JSON"} file here
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                or{" "}
                <span className="text-[var(--color-primary)]">
                  click to browse
                </span>
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={isRunning}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportHistory({ jobs }: { jobs: ImportJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <IconHistory size={18} className="text-[var(--color-text-muted)]" />
        <h2
          className="text-xs font-semibold text-[var(--color-text-muted)] tracking-widest ml-4"
          style={{ fontFamily: "RockfordSansMedium" }}
        >
          Import History
        </h2>
      </div>
      <div className="rounded-2xl overflow-hidden">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`flex items-center justify-between px-8 py-5 hover:bg-[var(--color-menu-hover)] transition-colors ${
              ""
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  job.status === "completed"
                    ? "bg-green-500"
                    : job.status === "running"
                    ? "bg-blue-400"
                    : job.status === "failed"
                    ? "bg-red-500"
                    : job.status === "pending"
                    ? "bg-yellow-500"
                    : "bg-[var(--color-text-muted)]"
                }`}
              />
              <div className="min-w-0">
                <p
                  className="text-sm text-[var(--color-text)] font-medium"
                  style={{ fontFamily: "RockfordSansMedium" }}
                >
                  {job.type === "lastfm" ? "Last.fm" : "Spotify"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {dayjs(job.createdAt).format("MMM D, YYYY [at] HH:mm")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4 flex-shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-[var(--color-text-muted)]">
                  {job.processed.toLocaleString()} / {job.total.toLocaleString()}
                </p>
                {job.failed > 0 && (
                  <p className="text-xs text-red-400">{job.failed} failed</p>
                )}
              </div>
              <StatusBadge status={job.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImportPage() {
  const navigate = useNavigate();
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [errors, setErrors] = useState<{ lastfm: string | null; spotify: string | null }>({
    lastfm: null,
    spotify: null,
  });
  const [uploading, setUploading] = useState(false);
  const [sseRetry, setSseRetry] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const jwt = localStorage.getItem("token");

  useEffect(() => {
    if (!jwt) navigate({ to: "/" });
  }, [jwt, navigate]);

  useEffect(() => {
    Promise.all([getImportStatus(), getImportJobs()]).then(([status, history]) => {
      setActiveJob(status);
      setJobs(history);
    });
  }, []);

  useEffect(() => {
    if (!jwt) return;
    if (activeJob?.status !== "running" && activeJob?.status !== "pending") return;
    if (esRef.current) esRef.current.close();

    const es = new EventSource(
      `${API_URL}/import/events?token=${encodeURIComponent(jwt)}`,
    );
    esRef.current = es;

    es.addEventListener("progress", (e: MessageEvent) => {
      const job: ImportJob | null = JSON.parse(e.data);
      if (!job) return;
      setActiveJob(job);
      setJobs((prev) =>
        prev.some((j) => j.id === job.id)
          ? prev.map((j) => (j.id === job.id ? job : j))
          : [job, ...prev],
      );
      if (
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      ) {
        es.close();
        esRef.current = null;
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setTimeout(() => setSseRetry((r) => r + 1), 3000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [activeJob?.status, jwt, sseRetry]);

  useEffect(() => {
    if (activeJob?.status !== "running" && activeJob?.status !== "pending") return;
    const interval = setInterval(async () => {
      if (esRef.current) return;
      const status = await getImportStatus();
      if (!status) return;
      setActiveJob(status);
      setJobs((prev) =>
        prev.some((j) => j.id === status.id)
          ? prev.map((j) => (j.id === status.id ? status : j))
          : [status, ...prev],
      );
    }, 5000);
    return () => clearInterval(interval);
  }, [activeJob?.status]);

  const handleCancel = async () => {
    setActiveJob((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    try {
      await cancelImport();
    } catch {
      setActiveJob((prev) => (prev ? { ...prev, status: "running" } : prev));
    }
  };

  const handleUpload = async (file: File, type: "lastfm" | "spotify") => {
    setErrors((prev) => ({ ...prev, [type]: null }));
    setUploading(true);
    try {
      const job = await uploadImportFile(file, type);
      setActiveJob(job);
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [type]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setUploading(false);
    }
  };

  const isRunning =
    activeJob?.status === "running" ||
    activeJob?.status === "pending" ||
    uploading;
  const showJobCard = activeJob && activeJob.status !== "pending";

  return (
    <Main withRightPane={false}>
      <div className="mt-[70px] mb-[150px] px-4 md:px-0 text-[var(--color-text)]">
        {/* Page header */}
        <div className="mb-8">
          <h1
            className="text-2xl text-[var(--color-text)] mb-2"
            style={{ fontFamily: "RockfordSansBold" }}
          >
            Import Scrobble History
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            Import your listening history from Last.fm or Spotify.{" "}
            Large imports run in the background — you can close this page and come back.
          </p>
        </div>

        {/* Active job */}
        {showJobCard && (
          <ActiveJobCard job={activeJob} onCancel={handleCancel} />
        )}

        {/* Source cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SourceCard
            type="lastfm"
            activeJob={isRunning ? activeJob : null}
            uploading={uploading}
            onUpload={handleUpload}
            error={errors.lastfm}
          />
          <SourceCard
            type="spotify"
            activeJob={isRunning ? activeJob : null}
            uploading={uploading}
            onUpload={handleUpload}
            error={errors.spotify}
          />
        </div>

        <ImportHistory jobs={jobs} />
      </div>
    </Main>
  );
}
