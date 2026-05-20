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
import { HeadingMedium, LabelMedium, LabelSmall } from "baseui/typography";
import dayjs from "dayjs";
import { IconUpload, IconCheck, IconX, IconLoader2, IconHistory } from "@tabler/icons-react";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-[var(--color-border)] rounded-full h-2 mt-2">
      <div
        className="bg-[var(--color-primary)] h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ImportJob["status"] }) {
  const map: Record<ImportJob["status"], { label: string; color: string }> = {
    pending:   { label: "Pending",   color: "text-yellow-500" },
    running:   { label: "Running",   color: "text-blue-400"   },
    completed: { label: "Completed", color: "text-green-500"  },
    failed:    { label: "Failed",    color: "text-red-500"    },
    cancelled: { label: "Cancelled", color: "text-[var(--color-text-muted)]" },
  };
  const { label, color } = map[status] ?? map.failed;
  return <span className={`font-semibold ${color}`}>{label}</span>;
}

function UploadCard({
  type,
  title,
  description,
  instructions,
  accept,
  activeJob,
  onUpload,
  error,
}: {
  type: "lastfm" | "spotify";
  title: string;
  description: string;
  instructions: React.ReactNode;
  accept: string;
  activeJob: ImportJob | null;
  onUpload: (file: File, type: "lastfm" | "spotify") => void;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const isRunning = activeJob?.status === "running";

  const handleFile = (file: File) => {
    if (isRunning) return;
    onUpload(file, type);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="rounded-xl p-8 mb-6">
      <div className="flex items-center gap-3 mb-1">
        <HeadingMedium className="!text-[var(--color-text)] !mb-0">{title}</HeadingMedium>
      </div>
      <LabelMedium className="!text-[var(--color-text-muted)] mb-4">{description}</LabelMedium>

      <div className="mb-4 text-sm text-[var(--color-text-muted)] leading-relaxed">
        {instructions}
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors
          ${dragging ? "border-[var(--color-primary)] bg-[var(--color-menu-hover)]" : "border-[var(--color-border)]"}
          ${isRunning ? "opacity-50 cursor-not-allowed" : "hover:border-[var(--color-primary)] hover:bg-[var(--color-menu-hover)]"}`}
        onClick={() => !isRunning && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!isRunning) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <IconUpload size={28} className="mb-2 text-[var(--color-text-muted)]" />
        <LabelMedium className="!text-[var(--color-text)]">
          {isRunning ? "Import in progress…" : "Drop file here or click to browse"}
        </LabelMedium>
        <LabelSmall className="!text-[var(--color-text-muted)] mt-1">
          {type === "lastfm" ? "CSV file" : "JSON file"}
        </LabelSmall>
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
        <div className="mt-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function ActiveJobCard({ job, onCancel }: { job: ImportJob; onCancel: () => void }) {
  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
  const errors: string[] = job.errors ? JSON.parse(job.errors) : [];

  return (
    <div className="rounded-xl p-8 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {job.status === "running" && (
            <IconLoader2 size={18} className="animate-spin text-blue-400" />
          )}
          {job.status === "completed" && (
            <IconCheck size={18} className="text-green-500" />
          )}
          {(job.status === "failed" || job.status === "cancelled") && (
            <IconX size={18} className="text-red-500" />
          )}
          <LabelMedium className="!text-[var(--color-text)] font-semibold">
            {job.type === "lastfm" ? "Last.fm" : "Spotify"} Import
          </LabelMedium>
        </div>
        <div className="flex items-center gap-3">
          {job.status === "running" && (
            <button
              onClick={onCancel}
              className="text-sm font-semibold !text-red-500 hover:!text-red-400 cursor-pointer bg-transparent px-3 py-1 rounded-md border border-red-500/40 hover:border-red-400/60 transition-colors"
            >
              Cancel
            </button>
          )}
          <StatusBadge status={job.status} />
        </div>
      </div>

      <div className="flex justify-between text-sm text-[var(--color-text-muted)] mb-1">
        <span>{job.processed.toLocaleString()} / {job.total.toLocaleString()} scrobbles</span>
        <span>{pct}%</span>
      </div>
      <ProgressBar value={job.processed} max={job.total} />
      {job.status === "running" && job.currentTrack && (
        <LabelSmall className="!text-[var(--color-text-muted)] mt-2 truncate">
          ▶ {job.currentTrack}
        </LabelSmall>
      )}

      {job.failed > 0 && (
        <LabelSmall className="!text-red-400 mt-2">
          {job.failed} failed
        </LabelSmall>
      )}

      {errors.length > 0 && job.status === "failed" && (
        <div className="mt-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs space-y-1 max-h-32 overflow-y-auto">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {errors.length > 0 && job.status !== "failed" && (
        <details className="mt-3">
          <summary className="text-sm text-[var(--color-text-muted)] cursor-pointer">
            Show errors ({errors.length})
          </summary>
          <ul className="mt-2 text-xs text-red-400 max-h-32 overflow-y-auto space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="truncate">{e}</li>
            ))}
          </ul>
        </details>
      )}

      <LabelSmall className="!text-[var(--color-text-muted)] mt-3">
        Started {dayjs(job.createdAt).format("MMM D, YYYY HH:mm")}
        {job.status !== "running" && ` · Ended ${dayjs(job.updatedAt).format("HH:mm")}`}
      </LabelSmall>
    </div>
  );
}

function JobHistoryTable({ jobs }: { jobs: ImportJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <IconHistory size={18} className="text-[var(--color-text-muted)]" />
        <LabelMedium className="!text-[var(--color-text)] font-semibold">Import History</LabelMedium>
      </div>
      <div className="rounded-xl overflow-hidden">
        <table className="w-full text-sm text-[var(--color-text)]">
          <thead>
            <tr className="bg-[var(--color-background)]">
              <th className="text-left px-6 py-4 text-[var(--color-text-muted)] font-medium">Type</th>
              <th className="text-left px-6 py-4 text-[var(--color-text-muted)] font-medium">Status</th>
              <th className="text-left px-6 py-4 text-[var(--color-text-muted)] font-medium">Progress</th>
              <th className="text-left px-6 py-4 text-[var(--color-text-muted)] font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="bg-[var(--color-background)] hover:bg-[var(--color-menu-hover)] transition-colors"
              >
                <td className="px-6 py-4 text-[var(--color-text)]">
                  {job.type === "lastfm" ? "Last.fm" : "Spotify"}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 text-[var(--color-text-muted)]">
                  {job.processed.toLocaleString()} / {job.total.toLocaleString()}
                  {job.failed > 0 && (
                    <span className="text-red-400 ml-1">({job.failed} failed)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">
                  {dayjs(job.createdAt).format("MMM D, YYYY HH:mm")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ImportPage() {
  const navigate = useNavigate();
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [errors, setErrors] = useState<{ lastfm: string | null; spotify: string | null }>({ lastfm: null, spotify: null });
  const [uploading, setUploading] = useState(false);
  const [sseRetry, setSseRetry] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const jwt = localStorage.getItem("token");

  useEffect(() => {
    if (!jwt) navigate({ to: "/" });
  }, [jwt, navigate]);

  // Load initial state on mount
  useEffect(() => {
    Promise.all([getImportStatus(), getImportJobs()]).then(([status, history]) => {
      setActiveJob(status);
      setJobs(history);
    });
  }, []);

  // SSE subscription — connect when a job is active, disconnect when done
  useEffect(() => {
    if (!jwt) return;
    if (activeJob?.status !== "running" && activeJob?.status !== "pending") return;

    // Avoid duplicate connections
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
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        es.close();
        esRef.current = null;
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Reconnect after 3s so a transient network error doesn't kill progress updates
      setTimeout(() => setSseRetry((r) => r + 1), 3000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [activeJob?.status, jwt, sseRetry]);

  // Polling fallback — kicks in when SSE is not connected so progress always updates
  useEffect(() => {
    if (activeJob?.status !== "running" && activeJob?.status !== "pending") return;

    const interval = setInterval(async () => {
      if (esRef.current) return; // SSE is active, skip poll
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
    // Optimistic update so the button disappears immediately
    setActiveJob((prev) => prev ? { ...prev, status: "cancelled" } : prev);
    try {
      await cancelImport();
    } catch {
      // Revert if the API call failed
      setActiveJob((prev) => prev ? { ...prev, status: "running" } : prev);
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
      setErrors((prev) => ({ ...prev, [type]: err instanceof Error ? err.message : "Upload failed" }));
    } finally {
      setUploading(false);
    }
  };

  const isRunning = activeJob?.status === "running" || activeJob?.status === "pending" || uploading;
  const showJobCard = activeJob && activeJob.status !== "pending";

  return (
    <Main withRightPane={false}>
      <div className="mt-[70px] mb-[150px] px-4 md:px-0 text-[var(--color-text)]">
        <HeadingMedium
          marginTop="0px"
          marginBottom="8px"
          className="!text-[var(--color-text)]"
        >
          Import Scrobble History
        </HeadingMedium>
        <LabelMedium className="!text-[var(--color-text-muted)] mb-8">
          Import your listening history from Last.fm or Spotify. Large imports run in the background — you can close this page and come back.
        </LabelMedium>

        {showJobCard && (
          <ActiveJobCard job={activeJob} onCancel={handleCancel} />
        )}

        <UploadCard
          type="lastfm"
          title="Last.fm CSV"
          description="Import your full scrobble history exported from Last.fm."
          accept=".csv,text/csv"
          activeJob={isRunning ? activeJob : null}
          onUpload={handleUpload}
          error={errors.lastfm}
          instructions={
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Go to{" "}
                <a
                  href="https://lastfm.ghan.nl/export/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-primary)] underline"
                >
                  lastfm.ghan.nl/export
                </a>
              </li>
              <li>Enter your Last.fm username and export your scrobbles</li>
              <li>Upload the downloaded <code className="bg-[var(--color-border)] px-1 rounded">.csv</code> file here</li>
            </ol>
          }
        />

        <UploadCard
          type="spotify"
          title="Spotify Streaming History"
          description="Import from the JSON files in your Spotify data export."
          accept=".json,application/json"
          activeJob={isRunning ? activeJob : null}
          onUpload={handleUpload}
          error={errors.spotify}
          instructions={
            <ol className="list-decimal list-inside space-y-1">
              <li>
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
              </li>
              <li>Wait for the email with your data archive (can take a few days)</li>
              <li>
                Extract the archive and locate <code className="bg-[var(--color-border)] px-1 rounded">StreamingHistory_music_*.json</code>{" "}
                or <code className="bg-[var(--color-border)] px-1 rounded">Endsong_*.json</code> files
              </li>
              <li>Upload one file at a time — only tracks played for 30 seconds or more are imported</li>
            </ol>
          }
        />

        <JobHistoryTable jobs={jobs} />
      </div>
    </Main>
  );
}
