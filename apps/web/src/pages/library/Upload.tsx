import styled from "@emotion/styled";
import {
  IconCheck,
  IconCloudUpload,
  IconMusic,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useUploadTrackMutation } from "../../hooks/useUploads";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Accepted formats
// ---------------------------------------------------------------------------

const ACCEPTED_MIME_TYPES = {
  "audio/mpeg": [".mp3"],
  "audio/flac": [".flac"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/x-m4a": [".m4a"],
  "audio/ogg": [".ogg"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/aiff": [".aiff", ".aif"],
  "audio/x-aiff": [".aiff", ".aif"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileStatus =
  | { state: "pending" }
  | { state: "uploading"; progress: number }
  | { state: "done"; title: string; artist: string; album: string }
  | { state: "error"; message: string; missingFields?: string[] };

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
// Styled components
// ---------------------------------------------------------------------------

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const PageTitle = styled.h1`
  margin: 0 0 6px;
  font-size: 1.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const PageSubtitle = styled.p`
  margin: 0 0 16px;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

const MetaInfo = styled.div`
  margin: 0 0 32px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--color-menu-hover);
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  line-height: 1.6;
`;

const MetaLink = styled.a`
  color: var(--color-primary);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const DropZone = styled.div<{ active: boolean }>`
  border-radius: 16px;
  border: 2px dashed
    ${({ active }) =>
      active ? "var(--color-primary)" : "var(--color-menu-hover)"};
  padding: 56px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  background: ${({ active }) =>
    active ? "color-mix(in srgb, var(--color-primary) 5%, transparent)" : "transparent"};

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);
    background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  }
`;

const DropIconBox = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--color-menu-hover);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const DropLabel = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const DropHint = styled.p`
  margin: 4px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
`;

const Queue = styled.div`
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const QueueItem = styled.div`
  border-radius: 12px;
  overflow: hidden;
  background: var(--color-menu-hover);
`;

const QueueRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
`;

const QueueIcon = styled.div<{ state: string }>`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ state }) =>
    state === "done"
      ? "color-mix(in srgb, #4caf50 15%, transparent)"
      : state === "error"
      ? "color-mix(in srgb, #e55 15%, transparent)"
      : "color-mix(in srgb, var(--color-primary) 10%, transparent)"};
`;

const QueueFileInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const QueueFileName = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const QueueMeta = styled.p<{ error?: boolean; accent?: boolean }>`
  margin: 0;
  font-size: 0.75rem;
  color: ${({ error, accent }) =>
    error ? "#e55" : accent ? "var(--color-primary)" : "var(--color-text-muted)"};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Badge = styled.span<{ state: string }>`
  flex-shrink: 0;
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 999px;
  color: ${({ state }) =>
    state === "done" ? "#4caf50" : state === "error" ? "#e55" : "var(--color-primary)"};
  background: ${({ state }) =>
    state === "done"
      ? "color-mix(in srgb, #4caf50 10%, transparent)"
      : state === "error"
      ? "color-mix(in srgb, #e55 10%, transparent)"
      : "color-mix(in srgb, var(--color-primary) 10%, transparent)"};
`;

const ProgressBar = styled.div<{ value: number }>`
  height: 2px;
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);

  &::after {
    content: "";
    display: block;
    height: 100%;
    width: ${({ value }) => value}%;
    background: var(--color-primary);
    transition: width 0.2s;
  }
`;

const Summary = styled.p`
  margin: 12px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
`;

const PrimaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GhostButton = styled.button`
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }
`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const updateItem = (id: string, status: FileStatus) =>
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );

  const uploadMutation = useUploadTrackMutation();

  const processQueue = useCallback(
    async (items: QueueItem[]) => {
      setIsProcessing(true);
      for (const item of items) {
        if (item.status.state !== "pending") continue;
        updateItem(item.id, { state: "uploading", progress: 0 });
        try {
          const result = await uploadMutation.mutateAsync(item.file);
          updateItem(item.id, {
            state: "done",
            title: result.track.title,
            artist: result.track.artist,
            album: result.track.album,
          });
        } catch (err: any) {
          const data = err?.response?.data;
          updateItem(item.id, {
            state: "error",
            message: data?.message ?? "Upload failed",
            missingFields: data?.missingFields,
          });
        }
      }
      setIsProcessing(false);
    },
    [uploadMutation],
  );

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    const newItems: QueueItem[] = accepted.map((file) => ({
      file,
      id: String(++idCounter),
      status: { state: "pending" },
    }));
    const rejectedItems: QueueItem[] = rejected.map((r) => ({
      file: r.file,
      id: String(++idCounter),
      status: {
        state: "error" as const,
        message: "Only audio files are accepted (MP3, FLAC, M4A, OGG, WAV, AIFF)",
      },
    }));
    setQueue((prev) => [...prev, ...newItems, ...rejectedItems]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    multiple: true,
  });

  const pendingItems = queue.filter((i) => i.status.state === "pending");
  const doneCount = queue.filter((i) => i.status.state === "done").length;
  const errorCount = queue.filter((i) => i.status.state === "error").length;

  return (
    <Main>
      <Page>
        <PageTitle>Upload Music</PageTitle>
        <PageSubtitle>
          Files are private — only you can see and play them.
        </PageSubtitle>

        <MetaInfo>
          <strong style={{ color: "var(--color-text)" }}>Required metadata</strong>
          {" — "}Title · Artist · Album · Album artist · Duration · Album art
          <div style={{ marginTop: 10 }}>
            Need to tag your files?{" "}
            <MetaLink
              href="https://picard.musicbrainz.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              MusicBrainz Picard
            </MetaLink>{" "}
            is a free, open-source tagger that auto-fills metadata from the MusicBrainz database.
          </div>
        </MetaInfo>

        <DropZone active={isDragActive} {...getRootProps()}>
          <input {...getInputProps()} />
          <DropIconBox>
            <IconCloudUpload
              size={28}
              color={isDragActive ? "var(--color-primary)" : "var(--color-text-muted)"}
            />
          </DropIconBox>
          <div style={{ textAlign: "center" }}>
            <DropLabel>
              {isDragActive
                ? "Drop your audio files here"
                : "Drag & drop audio files, or click to browse"}
            </DropLabel>
            <DropHint>MP3, FLAC, M4A, OGG, WAV, AIFF</DropHint>
          </div>
        </DropZone>

        {queue.length > 0 && (
          <Queue>
            {queue.map((item) => {
              const s = item.status;
              return (
                <QueueItem key={item.id}>
                  <QueueRow>
                    <QueueIcon state={s.state}>
                      {s.state === "done" ? (
                        <IconCheck size={16} color="#4caf50" />
                      ) : s.state === "error" ? (
                        <IconX size={16} color="#e55" />
                      ) : (
                        <IconMusic size={16} color="var(--color-primary)" />
                      )}
                    </QueueIcon>

                    <QueueFileInfo>
                      <QueueFileName>{item.file.name}</QueueFileName>
                      {s.state === "done" && (
                        <QueueMeta>
                          {(s as any).title} · {(s as any).artist}
                        </QueueMeta>
                      )}
                      {s.state === "pending" && (
                        <QueueMeta>{formatBytes(item.file.size)} · Queued</QueueMeta>
                      )}
                      {s.state === "uploading" && (
                        <QueueMeta accent>Uploading…</QueueMeta>
                      )}
                      {s.state === "error" && (
                        <QueueMeta error>{(s as any).message}</QueueMeta>
                      )}
                    </QueueFileInfo>

                    {s.state !== "pending" && (
                      <Badge state={s.state}>
                        {s.state === "done"
                          ? "Uploaded"
                          : s.state === "error"
                          ? "Rejected"
                          : `${(s as any).progress}%`}
                      </Badge>
                    )}
                  </QueueRow>

                  {s.state === "uploading" && (
                    <ProgressBar value={(s as any).progress} />
                  )}
                </QueueItem>
              );
            })}
          </Queue>
        )}

        {(doneCount > 0 || errorCount > 0) && (
          <Summary>
            {doneCount > 0 && (
              <span style={{ color: "#4caf50" }}>{doneCount} uploaded</span>
            )}
            {doneCount > 0 && errorCount > 0 && " · "}
            {errorCount > 0 && (
              <span style={{ color: "#e55" }}>{errorCount} rejected</span>
            )}
          </Summary>
        )}

        <Actions>
          {pendingItems.length > 0 && (
            <PrimaryButton
              onClick={() => processQueue(queue)}
              disabled={isProcessing}
            >
              <IconCloudUpload size={15} />
              {isProcessing
                ? "Uploading…"
                : `Upload ${pendingItems.length} file${pendingItems.length !== 1 ? "s" : ""}`}
            </PrimaryButton>
          )}
          <GhostButton onClick={() => navigate({ to: "/library" })}>
            {pendingItems.length === 0 ? "Back to Library" : "Cancel"}
          </GhostButton>
        </Actions>
      </Page>
    </Main>
  );
}
