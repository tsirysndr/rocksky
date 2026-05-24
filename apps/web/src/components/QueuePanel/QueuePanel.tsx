import styled from "@emotion/styled";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconMusic, IconPlayerPlay, IconX } from "@tabler/icons-react";
import { useState } from "react";
import type { QueueTrack } from "../../atoms/queue";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Panel = styled.div`
  position: fixed;
  bottom: 128px;
  right: 24px;
  width: 360px;
  height: 560px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18);
  z-index: 102;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 0;
  flex-shrink: 0;
`;

const Tabs = styled.div`
  display: flex;
  gap: 4px;
  flex: 1;
`;

const Tab = styled.button<{ active: boolean }>`
  background: none;
  border: none;
  border-radius: 0;
  cursor: pointer;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: ${({ active }) => (active ? "var(--color-text)" : "var(--color-text-muted)")};
  padding: 4px 8px;
  border-bottom: 2px solid ${({ active }) => (active ? "var(--color-primary)" : "transparent")};
  transition: color 0.15s;
`;

const CloseBtn = styled.button`
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  &:hover { background: var(--color-menu-hover); }
`;

const Divider = styled.div`
  height: 1px;
  background: var(--color-menu-hover);
  margin: 10px 0 0;
`;

const ScrollArea = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 6px 0 8px;
`;

const SectionLabel = styled.p`
  margin: 8px 16px 4px;
  font-size: 0.7rem;
  font-family: RockfordSansMedium;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const Row = styled.div<{ active: boolean; dragging?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  cursor: pointer;
  position: relative;
  opacity: ${({ dragging }) => (dragging ? 0.4 : 1)};
  background: ${({ active }) =>
    active ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent"};

  &:hover {
    background: ${({ active }) =>
      active
        ? "color-mix(in srgb, var(--color-primary) 8%, transparent)"
        : "var(--color-menu-hover)"};
  }

  &:hover .row-remove {
    opacity: 1;
  }
`;

const ArtWrapper = styled.div`
  position: relative;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-menu-hover);
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover .art-play {
    opacity: 1;
  }
`;

const ArtPlayOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
`;

const TrackInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const TrackTitle = styled.p<{ active: boolean }>`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: ${({ active }) => (active ? "var(--color-primary)" : "var(--color-text)")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TrackMeta = styled.p`
  margin: 0;
  font-size: 0.725rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RemoveBtn = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.15s, color 0.15s;

  &:hover { color: var(--color-text); }
`;

const DragHandle = styled.div`
  cursor: grab;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  &:active { cursor: grabbing; }
`;

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

type SortableRowProps = {
  track: QueueTrack;
  id: string;
  active: boolean;
  onPlay: () => void;
  onRemove: () => void;
};

function SortableRow({ track, id, active, onPlay, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Row
        active={active}
        dragging={isDragging}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-handle]")) return;
          if ((e.target as HTMLElement).closest("[data-art]")) return;
          onPlay();
        }}
      >
        <ArtWrapper
          data-art
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
        >
          {track.albumArt ? (
            <img src={track.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <IconMusic size={14} color="var(--color-text-muted)" />
          )}
          <ArtPlayOverlay className="art-play">
            <IconPlayerPlay size={14} color="#fff" fill="#fff" />
          </ArtPlayOverlay>
        </ArtWrapper>

        <TrackInfo>
          <TrackTitle active={active}>{track.title}</TrackTitle>
          <TrackMeta>{track.artist} — {track.album}</TrackMeta>
        </TrackInfo>

        <RemoveBtn
          className="row-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <IconX size={13} />
        </RemoveBtn>

        <DragHandle data-handle {...attributes} {...listeners}>
          <IconGripVertical size={14} />
        </DragHandle>
      </Row>
    </div>
  );
}

// History row (no drag, no remove from history — just display)
function HistoryRow({ track, active, onPlay }: { track: QueueTrack; active: boolean; onPlay: () => void }) {
  return (
    <Row active={active} onClick={onPlay}>
      <ArtWrapper
        data-art
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
      >
        {track.albumArt ? (
          <img src={track.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <IconMusic size={14} color="var(--color-text-muted)" />
        )}
        <ArtPlayOverlay className="art-play">
          <IconPlayerPlay size={14} color="#fff" fill="#fff" />
        </ArtPlayOverlay>
      </ArtWrapper>
      <TrackInfo>
        <TrackTitle active={active}>{track.title}</TrackTitle>
        <TrackMeta>{track.artist} — {track.album}</TrackMeta>
      </TrackInfo>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// QueuePanel
// ---------------------------------------------------------------------------

type QueuePanelProps = {
  queue: QueueTrack[];
  queueIndex: number;
  onClose: () => void;
  onPlayIndex: (idx: number) => void;
  onRemove: (idx: number) => void;
  onReorder: (newQueue: QueueTrack[]) => void;
};

type TabType = "queue" | "history";

export function QueuePanel({
  queue,
  queueIndex,
  onClose,
  onPlayIndex,
  onRemove,
  onReorder,
}: QueuePanelProps) {
  const [tab, setTab] = useState<TabType>("queue");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const upNext = queue.slice(queueIndex + 1);
  const history = queue.slice(0, queueIndex);
  const nowPlaying = queue[queueIndex];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const upNextIds = upNext.map((_, i) => `upnext-${queueIndex + 1 + i}`);
    const oldIdx = upNextIds.indexOf(active.id as string);
    const newIdx = upNextIds.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;

    const absoluteOld = queueIndex + 1 + oldIdx;
    const absoluteNew = queueIndex + 1 + newIdx;
    onReorder(arrayMove(queue, absoluteOld, absoluteNew));
  }

  return (
    <Panel>
      <Header>
        <Tabs>
          <Tab active={tab === "queue"} onClick={() => setTab("queue")}>Play Queue</Tab>
          <Tab active={tab === "history"} onClick={() => setTab("history")}>History</Tab>
        </Tabs>
        {tab === "queue" && queue.length > 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "RockfordSansMedium", marginRight: 8, flexShrink: 0 }}>
            {queueIndex + 1}/{queue.length}
          </span>
        )}
        <CloseBtn onClick={onClose}><IconX size={16} /></CloseBtn>
      </Header>
      <Divider />

      <ScrollArea>
        {tab === "queue" && (
          <>
            {/* Currently playing */}
            {nowPlaying && (
              <>
                <SectionLabel>Now Playing</SectionLabel>
                <Row active={true}>
                  <ArtWrapper>
                    {nowPlaying.albumArt ? (
                      <img src={nowPlaying.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <IconMusic size={14} color="var(--color-text-muted)" />
                    )}
                  </ArtWrapper>
                  <TrackInfo>
                    <TrackTitle active={true}>{nowPlaying.title}</TrackTitle>
                    <TrackMeta>{nowPlaying.artist} — {nowPlaying.album}</TrackMeta>
                  </TrackInfo>
                </Row>
              </>
            )}

            {/* Up next — draggable */}
            {upNext.length > 0 && (
              <>
                <SectionLabel>Up Next</SectionLabel>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={upNext.map((_, i) => `upnext-${queueIndex + 1 + i}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {upNext.map((track, i) => {
                      const absoluteIdx = queueIndex + 1 + i;
                      return (
                        <SortableRow
                          key={`${track.uploadId}-${absoluteIdx}`}
                          id={`upnext-${absoluteIdx}`}
                          track={track}
                          active={false}
                          onPlay={() => onPlayIndex(absoluteIdx)}
                          onRemove={() => onRemove(absoluteIdx)}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </>
            )}

            {upNext.length === 0 && !nowPlaying && (
              <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.8rem", marginTop: 24 }}>
                Queue is empty
              </p>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {history.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.8rem", marginTop: 24 }}>
                No history yet
              </p>
            ) : (
              [...history].reverse().map((track, i) => {
                const absoluteIdx = queueIndex - 1 - i;
                return (
                  <HistoryRow
                    key={`${track.uploadId}-${absoluteIdx}`}
                    track={track}
                    active={false}
                    onPlay={() => onPlayIndex(absoluteIdx)}
                  />
                );
              })
            )}
          </>
        )}
      </ScrollArea>
    </Panel>
  );
}

export default QueuePanel;
