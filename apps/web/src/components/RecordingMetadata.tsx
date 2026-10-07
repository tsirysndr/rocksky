import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import musicBrainzLogo from "../assets/musicbrainz.svg";

export default function RecordingMetadata({
  mbId,
  isrc,
}: {
  mbId?: string | null;
  isrc?: string | null;
}) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const recordingId = mbId?.trim();
  const code = isrc?.trim();
  if (!recordingId && !code) return null;
  return (
    <div
      className="flex flex-col items-start"
      style={{ gap: 20, marginTop: 20 }}
    >
      {recordingId && (
        <a
          href={`https://musicbrainz.org/recording/${encodeURIComponent(recordingId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full no-underline text-sm"
          style={{
            backgroundColor: "var(--color-menu-hover, var(--color-surface-2))",
            color: "var(--color-text)",
          }}
        >
          <img
            src={musicBrainzLogo}
            width={24}
            height={24}
            alt=""
            aria-hidden="true"
          />
          View on MusicBrainz
        </a>
      )}
      {code && (
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          <span>
            ISRC: <span style={{ fontFamily: "var(--font-mono)" }}>{code}</span>
          </span>
          <button
            type="button"
            aria-label="Copy ISRC"
            title="Copy ISRC"
            className="inline-flex items-center justify-center p-2 rounded-full cursor-pointer"
            style={{ background: "transparent", border: 0, color: "inherit" }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(code);
                setError("");
              } catch {
                setError(
                  "Could not copy ISRC. Select the code to copy it manually.",
                );
              }
            }}
          >
            {copied === code ? <IconCheck size={18} /> : <IconCopy size={18} />}
          </button>
          <span role="status">
            {error || (copied === code ? "Copied" : "")}
          </span>
        </div>
      )}
    </div>
  );
}
