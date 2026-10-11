import { useState } from "react";
import { Modal, ModalBody, ModalHeader } from "baseui/modal";
import { IconLink } from "@tabler/icons-react";
import { useUploadPlayer } from "../hooks/useUploadPlayer";
import type { QueueTrack } from "../atoms/queue";
import { isTauri } from "../lib/tauri";

type Metadata = {
  url: string;
  cacheId: string;
  title: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string;
  durationMs?: number;
  mimeType?: string;
};
export default function OpenAudioUrl() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { playNow, playNext, playLast } = useUploadPlayer();
  const submit = async (mode: "now" | "next" | "last") => {
    if (busy || !url.trim()) return;
    setBusy(true);
    setError("");
    try {
      const m: Metadata = {
        url: url.trim(),
        cacheId: url.trim(),
        title: "Audio stream",
      };
      const track: QueueTrack = {
        uploadId: `url:${m.cacheId}`,
        audioUrl: m.url,
        streamUrl: m.url,
        title: m.title,
        artist: m.artist ?? "",
        albumArtist: m.albumArtist || m.artist || "",
        album: m.album ?? "",
        albumArt: m.albumArt ?? null,
        duration: m.durationMs ?? 0,
        sha256: "",
        songUri: "",
        mimeType: m.mimeType,
      };
      if (mode === "now") await playNow([track], 0);
      else if (mode === "next") await playNext(track);
      else await playLast(track);
      setOpen(false);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!isTauri()) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          gap: 6,
          alignItems: "center",
          padding: "8px 14px",
          borderRadius: 24,
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          cursor: "pointer",
        }}
      >
        <IconLink size={16} />
        Open audio URL
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        closeable={!busy}
      >
        <ModalHeader>Open audio URL</ModalHeader>
        <ModalBody>
          <label>
            Audio URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              placeholder="https://example.com/track.mp3"
              style={{
                display: "block",
                width: "100%",
                margin: "8px 0 16px",
                padding: 12,
              }}
            />
          </label>
          {busy && <p role="status">Checking audio and reading tags…</p>}
          {error && <p role="alert">{error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(
              [
                ["now", "Play now"],
                ["next", "Play next"],
                ["last", "Add to queue"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                disabled={busy || !url.trim()}
                onClick={() => void submit(mode)}
                style={{
                  padding: "10px 16px",
                  border: 0,
                  borderRadius: 24,
                  background: "var(--color-primary)",
                  color: "white",
                  cursor: "pointer",
                  opacity: busy || !url.trim() ? 0.5 : 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}
