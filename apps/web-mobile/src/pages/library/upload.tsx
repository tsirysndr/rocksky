import {
  IconCheck,
  IconCloudUpload,
  IconMusic,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uploadTrack } from "../../api/uploads";
import Main from "../../layouts/Main";
import SignInModal from "../../components/SignInModal/SignInModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileStatus =
  | { state: "pending" }
  | { state: "uploading"; progress: number }
  | { state: "done"; title: string; artist: string; album: string }
  | { state: "error"; message: string };

interface QueueItem {
  file: File;
  id: string;
  status: FileStatus;
}

let idCounter = 0;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const navigate = useNavigate();
  const isAuthenticated = !!localStorage.getItem("token");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, status: FileStatus) =>
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item))), []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const ACCEPTED = new Set(["audio/mpeg", "audio/flac", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/wav", "audio/x-wav", "audio/aiff", "audio/x-aiff"]);
    const newItems: QueueItem[] = Array.from(files).map((file) => ({
      file,
      id: String(++idCounter),
      status: ACCEPTED.has(file.type) || file.name.match(/\.(mp3|flac|m4a|ogg|wav|aiff|aif)$/i)
        ? { state: "pending" as const }
        : { state: "error" as const, message: "Only audio files are accepted" },
    }));
    setQueue((prev) => [...prev, ...newItems]);
  }, []);

  const processQueue = useCallback(async (items: QueueItem[]) => {
    setIsProcessing(true);
    for (const item of items) {
      if (item.status.state !== "pending") continue;
      updateItem(item.id, { state: "uploading", progress: 0 });
      try {
        const result = await uploadTrack(item.file, (progress) => {
          updateItem(item.id, { state: "uploading", progress });
        });
        updateItem(item.id, {
          state: "done",
          title: result.track.title,
          artist: result.track.artist,
          album: result.track.album,
        });
      } catch (err: unknown) {
        const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
        updateItem(item.id, {
          state: "error",
          message: data?.message ?? "Upload failed",
        });
      }
    }
    setIsProcessing(false);
  }, [updateItem]);

  const pendingItems = queue.filter((i) => i.status.state === "pending");
  const doneCount = queue.filter((i) => i.status.state === "done").length;
  const errorCount = queue.filter((i) => i.status.state === "error").length;

  if (!isAuthenticated) {
    return (
      <Main>
        <SignInModal isOpen onClose={() => navigate("/library")} />
      </Main>
    );
  }

  return (
    <Main>
      <div className="px-4 pt-4 pb-32">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <Link to="/library" className="text-sm no-underline" style={{ color: "var(--color-text-muted)" }}>
            ← Library
          </Link>
        </div>
        <h1 className="text-xl font-bold mt-3 mb-1" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
          Upload Music
        </h1>
        <p className="text-sm m-0 mb-5" style={{ color: "var(--color-text-muted)" }}>
          Files are private — only you can see and play them.
        </p>

        {/* Required metadata info */}
        <div
          className="rounded-xl p-4 mb-5 text-sm"
          style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)" }}
        >
          <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Required metadata</span>
          {" — "}Title · Artist · Album · Album artist · Duration · Album art
        </div>

        {/* File picker */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.flac,.m4a,.ogg,.wav,.aiff,.aif,audio/*"
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed cursor-pointer bg-transparent"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--color-menu-hover)" }}
          >
            <IconCloudUpload size={28} color="var(--color-text-muted)" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold m-0" style={{ color: "var(--color-text)" }}>
              Tap to select audio files
            </p>
            <p className="text-xs m-0 mt-1" style={{ color: "var(--color-text-muted)" }}>
              MP3, FLAC, M4A, OGG, WAV, AIFF
            </p>
          </div>
        </button>

        {/* Queue */}
        {queue.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {queue.map((item) => {
              const s = item.status;
              return (
                <div key={item.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--color-menu-hover)" }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Status icon */}
                    <div
                      className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor:
                          s.state === "done" ? "rgba(76,175,80,0.15)"
                          : s.state === "error" ? "rgba(238,85,85,0.15)"
                          : "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                      }}
                    >
                      {s.state === "done" ? (
                        <IconCheck size={15} color="#4caf50" />
                      ) : s.state === "error" ? (
                        <IconX size={15} color="#e55" />
                      ) : (
                        <IconMusic size={15} color="var(--color-primary)" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>
                        {item.file.name}
                      </p>
                      {s.state === "done" && (
                        <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
                          {(s as { title: string }).title} · {(s as { artist: string }).artist}
                        </p>
                      )}
                      {s.state === "pending" && (
                        <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>
                          {formatBytes(item.file.size)} · Queued
                        </p>
                      )}
                      {s.state === "uploading" && (
                        <p className="text-xs m-0" style={{ color: "var(--color-primary)" }}>
                          Uploading… {(s as { progress: number }).progress}%
                        </p>
                      )}
                      {s.state === "error" && (
                        <p className="text-xs truncate m-0" style={{ color: "#e55" }}>
                          {(s as { message: string }).message}
                        </p>
                      )}
                    </div>

                    {/* Badge */}
                    {s.state !== "pending" && (
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-full shrink-0"
                        style={{
                          color: s.state === "done" ? "#4caf50" : s.state === "error" ? "#e55" : "var(--color-primary)",
                          backgroundColor: s.state === "done" ? "rgba(76,175,80,0.1)" : s.state === "error" ? "rgba(238,85,85,0.1)" : "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                        }}
                      >
                        {s.state === "done" ? "Uploaded" : s.state === "error" ? "Rejected" : `${(s as { progress: number }).progress}%`}
                      </span>
                    )}
                  </div>

                  {s.state === "uploading" && (
                    <div className="h-0.5 w-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)" }}>
                      <div
                        className="h-full transition-all duration-200"
                        style={{ width: `${(s as { progress: number }).progress}%`, backgroundColor: "var(--color-primary)" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {(doneCount > 0 || errorCount > 0) && (
          <p className="text-xs mt-3 mb-0" style={{ color: "var(--color-text-muted)" }}>
            {doneCount > 0 && <span style={{ color: "#4caf50" }}>{doneCount} uploaded</span>}
            {doneCount > 0 && errorCount > 0 && " · "}
            {errorCount > 0 && <span style={{ color: "#e55" }}>{errorCount} rejected</span>}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          {pendingItems.length > 0 && (
            <button
              onClick={() => processQueue(queue)}
              disabled={isProcessing}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border-none cursor-pointer text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
            >
              <IconCloudUpload size={15} />
              {isProcessing ? "Uploading…" : `Upload ${pendingItems.length} file${pendingItems.length !== 1 ? "s" : ""}`}
            </button>
          )}
          <Link
            to="/library"
            className="px-5 py-3 rounded-xl text-sm font-semibold no-underline"
            style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)" }}
          >
            {pendingItems.length === 0 ? "Back to Library" : "Cancel"}
          </Link>
        </div>
      </div>
    </Main>
  );
}
