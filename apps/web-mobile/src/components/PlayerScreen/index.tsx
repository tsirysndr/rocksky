import {
  IconArrowsShuffle,
  IconChevronDown,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconPlaylist,
  IconRepeat,
  IconRepeatOnce,
  IconX,
} from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import { playerScreenOpenAtom } from "../../atoms/playerScreen";
import type { QueueTrack } from "../../atoms/queue";
import type { RepeatMode } from "../../atoms/playback";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Queue panel — two tabs: Play Queue / History
// ---------------------------------------------------------------------------

type QueueTab = "queue" | "history";

function QueuePanel({
  open,
  onClose,
  queue,
  currentIndex,
  onSelectIndex,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  queue: QueueTrack[];
  currentIndex: number;
  onSelectIndex: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const [tab, setTab] = useState<QueueTab>("queue");

  const upNext = queue.slice(currentIndex + 1);
  const history = queue.slice(0, currentIndex);
  const nowPlayingTrack = queue[currentIndex];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="absolute inset-0 z-10"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
      )}

      {/* Slide-up panel */}
      <div
        className="absolute left-0 right-0 bottom-0 z-20 rounded-t-2xl flex flex-col transition-transform duration-300"
        style={{
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          height: "70vh",
          transform: open ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>

        {/* Tabs + counter + close */}
        <div className="flex items-center px-2 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <button
            onClick={() => setTab("queue")}
            className="px-3 py-3 border-none bg-transparent cursor-pointer text-sm font-semibold"
            style={{
              color: tab === "queue" ? "var(--color-text)" : "var(--color-text-muted)",
              borderBottom: tab === "queue" ? "2px solid var(--color-primary)" : "2px solid transparent",
            }}
          >
            Play Queue
          </button>
          <button
            onClick={() => setTab("history")}
            className="px-3 py-3 border-none bg-transparent cursor-pointer text-sm font-semibold"
            style={{
              color: tab === "history" ? "var(--color-text)" : "var(--color-text-muted)",
              borderBottom: tab === "history" ? "2px solid var(--color-primary)" : "2px solid transparent",
            }}
          >
            History
          </button>
          {tab === "queue" && queue.length > 0 && (
            <span className="text-xs ml-1 flex-1" style={{ color: "var(--color-text-muted)" }}>
              {currentIndex + 1}/{queue.length}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-2 ml-auto border-none bg-transparent cursor-pointer rounded-lg"
            style={{ color: "var(--color-text-muted)" }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Track list */}
        <div className="overflow-y-auto flex-1">
          {tab === "queue" && (
            <>
              {/* Now Playing */}
              {nowPlayingTrack && (
                <>
                  <p className="px-4 pt-3 pb-1 m-0 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    Now Playing
                  </p>
                  <QueueRow
                    track={nowPlayingTrack}
                    isActive
                    showRemove={false}
                    onClick={() => {}}
                    onRemove={() => {}}
                  />
                </>
              )}

              {/* Up Next */}
              {upNext.length > 0 && (
                <>
                  <p className="px-4 pt-3 pb-1 m-0 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    Up Next
                  </p>
                  {upNext.map((track, i) => {
                    const absoluteIdx = currentIndex + 1 + i;
                    return (
                      <QueueRow
                        key={`${track.uploadId}-${absoluteIdx}`}
                        track={track}
                        isActive={false}
                        showRemove
                        onClick={() => onSelectIndex(absoluteIdx)}
                        onRemove={() => onRemove(absoluteIdx)}
                      />
                    );
                  })}
                </>
              )}

              {!nowPlayingTrack && upNext.length === 0 && (
                <p className="text-center text-sm py-10 m-0" style={{ color: "var(--color-text-muted)" }}>
                  Queue is empty
                </p>
              )}
            </>
          )}

          {tab === "history" && (
            <>
              {history.length === 0 ? (
                <p className="text-center text-sm py-10 m-0" style={{ color: "var(--color-text-muted)" }}>
                  No history yet
                </p>
              ) : (
                [...history].reverse().map((track, i) => {
                  const absoluteIdx = currentIndex - 1 - i;
                  return (
                    <QueueRow
                      key={`${track.uploadId}-${absoluteIdx}`}
                      track={track}
                      isActive={false}
                      showRemove={false}
                      onClick={() => { onSelectIndex(absoluteIdx); onClose(); }}
                      onRemove={() => {}}
                    />
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function QueueRow({
  track,
  isActive,
  showRemove,
  onClick,
  onRemove,
}: {
  track: QueueTrack;
  isActive: boolean;
  showRemove: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70"
      style={{
        backgroundColor: isActive ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent",
        borderBottom: "1px solid var(--color-border)",
      }}
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: "var(--color-menu-hover)" }}
      >
        {track.albumArt ? (
          <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
        ) : (
          <IconMusic size={16} color="var(--color-text-muted)" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate m-0"
          style={{ color: isActive ? "var(--color-primary)" : "var(--color-text)" }}
        >
          {track.title}
        </p>
        <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
          {track.artist}{track.album ? ` — ${track.album}` : ""}
        </p>
      </div>
      {isActive && (
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: "var(--color-primary)" }}
        />
      )}
      {showRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player screen
// ---------------------------------------------------------------------------

interface PlayerScreenProps {
  onSeek: (positionMs: number) => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectQueueIndex: (i: number) => void;
  onRemoveFromQueue: (i: number) => void;
  queue: QueueTrack[];
  queueIndex: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  onShuffle: () => void;
  onRepeat: () => void;
}

export default function PlayerScreen({
  onSeek,
  onPlayPause,
  onNext,
  onPrevious,
  onSelectQueueIndex,
  onRemoveFromQueue,
  queue,
  queueIndex,
  shuffle,
  repeatMode,
  onShuffle,
  onRepeat,
}: PlayerScreenProps) {
  const [open, setOpen] = useAtom(playerScreenOpenAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const player = useAtomValue(playerAtom);
  const [queueOpen, setQueueOpen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const progressRef = useRef(0);

  // Close if upload player stops
  useEffect(() => {
    if (player !== "upload") setOpen(false);
  }, [player, setOpen]);

  // Close queue when screen closes
  useEffect(() => {
    if (!open) setQueueOpen(false);
  }, [open]);

  // Keep local progress in sync when not seeking
  useEffect(() => {
    if (!isSeeking && nowPlaying) {
      progressRef.current = nowPlaying.progress;
      setSeekValue(nowPlaying.progress);
    }
  }, [nowPlaying?.progress, isSeeking]);

  const handleSeekCommit = useCallback((value: number) => {
    setIsSeeking(false);
    onSeek(value);
  }, [onSeek]);

  if (!open || !nowPlaying || player !== "upload") return null;

  const progress = nowPlaying.duration > 0 ? (seekValue / nowPlaying.duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      {/* Blurred album art background */}
      {nowPlaying.albumArt && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${nowPlaying.albumArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px)",
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Content */}
      <div className="relative flex flex-col flex-1 min-h-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <button
            onClick={() => setOpen(false)}
            className="p-2 border-none bg-transparent cursor-pointer rounded-full"
            style={{ color: "var(--color-text-muted)", backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <IconChevronDown size={22} />
          </button>

          <p className="text-xs font-semibold uppercase tracking-widest m-0" style={{ color: "var(--color-text-muted)" }}>
            Now Playing
          </p>

          <button
            onClick={() => setQueueOpen((o) => !o)}
            className="p-2 border-none cursor-pointer rounded-full"
            style={{
              color: queueOpen ? "var(--color-primary)" : "var(--color-text-muted)",
              backgroundColor: queueOpen ? "color-mix(in srgb, var(--color-primary) 15%, transparent)" : "rgba(255,255,255,0.08)",
            }}
          >
            <IconPlaylist size={22} />
          </button>
        </div>

        {/* Album art */}
        <div className="flex-1 flex items-center justify-center px-8 py-4 min-h-0">
          <div
            className="w-full aspect-square rounded-3xl overflow-hidden flex items-center justify-center"
            style={{
              backgroundColor: "var(--color-surface-2)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              maxWidth: "min(100%, 380px)",
            }}
          >
            {nowPlaying.albumArt ? (
              <img
                src={nowPlaying.albumArt}
                alt={nowPlaying.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <IconMusic size={80} color="var(--color-text-muted)" strokeWidth={1} />
            )}
          </div>
        </div>

        {/* Track info + controls */}
        <div className="shrink-0 px-6" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          {/* Title + artist */}
          <div className="mb-5">
            <p
              className="text-2xl font-bold m-0 mb-1 truncate"
              style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}
            >
              {nowPlaying.title}
            </p>
            <p className="text-base m-0 truncate" style={{ color: "var(--color-text-muted)" }}>
              {nowPlaying.artist}
              {queue[queueIndex]?.album && (
                <span> · {queue[queueIndex].album}</span>
              )}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-5">
            <input
              type="range"
              min={0}
              max={nowPlaying.duration || 1}
              value={seekValue}
              step={1000}
              className="w-full"
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                height: "4px",
                borderRadius: "2px",
                background: `linear-gradient(to right, var(--color-primary) ${progress}%, var(--color-border) ${progress}%)`,
                outline: "none",
                cursor: "pointer",
              }}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={(e) => setSeekValue(Number(e.target.value))}
              onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {formatTime(isSeeking ? seekValue : nowPlaying.progress)}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {formatTime(nowPlaying.duration)}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between px-2">
            <button
              onClick={onShuffle}
              className="p-3 border-none bg-transparent cursor-pointer"
            >
              <IconArrowsShuffle size={22} color={shuffle ? "var(--color-primary)" : "var(--color-text-muted)"} />
            </button>

            <button
              onClick={onPrevious}
              className="p-3 border-none bg-transparent cursor-pointer"
              style={{ color: "var(--color-text)" }}
            >
              <IconPlayerSkipBackFilled size={32} />
            </button>

            <button
              onClick={onPlayPause}
              className="rounded-full border-none flex items-center justify-center cursor-pointer"
              style={{
                width: 72,
                height: 72,
                backgroundColor: "var(--color-primary)",
                boxShadow: "0 8px 24px rgba(255,40,118,0.4)",
              }}
            >
              {nowPlaying.isPlaying ? (
                <IconPlayerPauseFilled size={32} color="#fff" />
              ) : (
                <IconPlayerPlayFilled size={32} color="#fff" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-3 border-none bg-transparent cursor-pointer"
              style={{ color: "var(--color-text)" }}
            >
              <IconPlayerSkipForwardFilled size={32} />
            </button>

            <button
              onClick={onRepeat}
              className="p-3 border-none bg-transparent cursor-pointer"
            >
              {repeatMode === "one"
                ? <IconRepeatOnce size={22} color="var(--color-primary)" />
                : <IconRepeat size={22} color={repeatMode === "all" ? "var(--color-primary)" : "var(--color-text-muted)"} />
              }
            </button>
          </div>
        </div>
      </div>

      {/* Queue panel — slides up over content */}
      <QueuePanel
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        queue={queue}
        currentIndex={queueIndex}
        onSelectIndex={(i) => {
          onSelectQueueIndex(i);
          setQueueOpen(false);
        }}
        onRemove={onRemoveFromQueue}
      />
    </div>
  );
}
