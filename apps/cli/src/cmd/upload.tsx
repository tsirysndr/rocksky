import { Box, render, Text, useApp } from "ink";
import { loadToken } from "lib/token";
import { collectAudioFiles, uploadTrack } from "lib/uploadTrack";
import path from "path";
import React, { useEffect, useState } from "react";

const VIOLET = "#A855F7";
const BLUE = "#22D3EE";
const TEAL = "#00F5D4";
const RED = "#FF5F87";
const CONCURRENCY = 3;
const BAR_WIDTH = 24;

type Status = "pending" | "uploading" | "done" | "skipped" | "error";
interface FileState {
  file: string;
  pct: number;
  status: Status;
  message?: string;
}

function Bar({ pct, color }: { pct: number; color: string }) {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"─".repeat(BAR_WIDTH - filled)}</Text>
    </Text>
  );
}

const ICON: Record<Status, string> = {
  pending: "◦",
  uploading: "▸",
  done: "✔",
  skipped: "•",
  error: "✖",
};
const ICON_COLOR: Record<Status, string> = {
  pending: VIOLET,
  uploading: BLUE,
  done: TEAL,
  skipped: VIOLET,
  error: RED,
};

function Row({ s }: { s: FileState }) {
  return (
    <Box>
      <Box width={2}>
        <Text color={ICON_COLOR[s.status]}>{ICON[s.status]}</Text>
      </Box>
      <Box flexGrow={1} minWidth={0} marginRight={1}>
        <Text wrap="truncate-middle">{path.basename(s.file)}</Text>
      </Box>
      {s.status === "error" || s.status === "skipped" ? (
        <Box width={40}>
          <Text color={s.status === "error" ? RED : VIOLET} wrap="truncate-end">
            {s.message || (s.status === "skipped" ? "already in library" : "failed")}
          </Text>
        </Box>
      ) : (
        <>
          <Box marginRight={1}>
            <Bar pct={s.pct} color={s.status === "done" ? TEAL : BLUE} />
          </Box>
          <Box width={5} justifyContent="flex-end">
            <Text color={s.status === "done" ? TEAL : undefined}>
              {s.status === "done" ? "done" : s.status === "pending" ? "—" : `${s.pct}%`}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}

function UploadApp({ token, files }: { token: string; files: string[] }) {
  const { exit } = useApp();
  const [states, setStates] = useState<FileState[]>(
    files.map((f) => ({ file: f, pct: 0, status: "pending" })),
  );

  useEffect(() => {
    let cancelled = false;
    const update = (i: number, u: Partial<FileState>) =>
      setStates((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...u } : s)));

    let next = 0;
    async function worker() {
      while (!cancelled) {
        const i = next++;
        if (i >= files.length) return;
        update(i, { status: "uploading", pct: 0 });
        try {
          await uploadTrack(token, files[i], (pct) =>
            !cancelled && update(i, { status: "uploading", pct }),
          );
          update(i, { status: "done", pct: 100 });
        } catch (e: any) {
          const message = e?.response?.data?.message || e?.message || "Upload failed";
          const status: Status = e?.response?.status === 409 ? "skipped" : "error";
          update(i, { status, message });
        }
      }
    }

    Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker),
    ).then(() => {
      if (!cancelled) setTimeout(() => exit(), 300);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const done = states.filter((s) => s.status === "done").length;
  const skipped = states.filter((s) => s.status === "skipped").length;
  const failed = states.filter((s) => s.status === "error").length;
  const finished = done + skipped + failed;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={BLUE}>
        {`♫ Uploading ${files.length} file${files.length === 1 ? "" : "s"} to Rocksky`}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {states.map((s, i) => (
          <Row key={i} s={s} />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {finished === files.length
            ? `Finished — ${done} uploaded, ${skipped} skipped, ${failed} failed`
            : `${finished}/${files.length} done · ${done} uploaded · ${skipped} skipped · ${failed} failed`}
        </Text>
      </Box>
    </Box>
  );
}

export async function upload(files: string[]) {
  const token = loadToken();
  if (!token) {
    console.error(
      "You are not logged in. Run `rocksky login <handle>` first.",
    );
    process.exit(1);
  }

  const collected = collectAudioFiles(files);
  if (collected.length === 0) {
    console.error(
      "No audio files found. Supported: mp3, flac, m4a, ogg, wav, aiff.",
    );
    process.exit(1);
  }

  const { waitUntilExit } = render(
    <UploadApp token={token} files={collected} />,
  );
  await waitUntilExit();
  process.exit(0);
}
