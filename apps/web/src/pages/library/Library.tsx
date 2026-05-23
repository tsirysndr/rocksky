import styled from "@emotion/styled";
import {
  IconMusic,
  IconPlayerPlay,
  IconTrash,
  IconUpload,
  IconVinyl,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { UploadedTrack } from "../../api/uploads";
import {
  useDeleteUploadMutation,
  useStreamUrlQuery,
  useUploadsQuery,
} from "../../hooks/useUploads";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const UploadButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 12px;
  border: none;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }
`;

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TrackRow = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  background: ${({ active }) =>
    active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent"};

  &:hover {
    background: ${({ active }) =>
      active
        ? "color-mix(in srgb, var(--color-primary) 10%, transparent)"
        : "var(--color-menu-hover)"};
  }

  & .delete-btn {
    opacity: 0;
  }
  &:hover .delete-btn {
    opacity: 1;
  }
`;

const ArtworkBox = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
`;

const ArtworkOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;

  ${TrackRow}:hover & {
    opacity: 1;
  }
`;

const TrackInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const TrackTitle = styled.p<{ active: boolean }>`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ active }) => (active ? "var(--color-primary)" : "var(--color-text)")};
`;

const TrackMeta = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Duration = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
`;

const DeleteBtn = styled.button`
  padding: 6px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;

  &:hover {
    background: color-mix(in srgb, #e55 15%, transparent);
    color: #e55;
  }
`;

const PlayerWrap = styled.div`
  padding: 0 12px 8px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 96px 0;
  color: var(--color-text-muted);
`;

const IconWrap = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const EmptyTitle = styled.p`
  margin: 0;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const EmptySubtitle = styled.p`
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-align: center;
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
  opacity: 1;

  &:hover {
    opacity: 0.9;
  }
`;

const Muted = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TrackPlayer({ uploadId }: { uploadId: string }) {
  const { data, isLoading } = useStreamUrlQuery(uploadId);
  if (isLoading) return <Muted>Loading…</Muted>;
  if (!data?.url) return null;
  return (
    <audio
      src={data.url}
      controls
      autoPlay
      style={{ width: "100%", height: 32, accentColor: "var(--color-primary)" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Library() {
  const navigate = useNavigate();
  const { data: uploads = [], isLoading } = useUploadsQuery();
  const deleteMutation = useDeleteUploadMutation();
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, uploadId: string) => {
    e.stopPropagation();
    if (!confirm("Remove this track from your library?")) return;
    if (activeUploadId === uploadId) setActiveUploadId(null);
    await deleteMutation.mutateAsync(uploadId);
  };

  return (
    <Main>
      <Page>
        <Header>
          <Title>My Library</Title>
          <UploadButton onClick={() => navigate({ to: "/library/upload" })}>
            <IconUpload size={15} />
            Upload Music
          </UploadButton>
        </Header>

        {isLoading && <Muted>Loading…</Muted>}

        {!isLoading && uploads.length === 0 && (
          <EmptyState>
              <IconVinyl size={48} color="var(--color-text-muted)" />
            <div style={{ textAlign: "center" }}>
              <EmptyTitle>Your library is empty</EmptyTitle>
              <EmptySubtitle>Upload your music files to start listening</EmptySubtitle>
            </div>
            <PrimaryButton onClick={() => navigate({ to: "/library/upload" })}>
              <IconUpload size={15} />
              Upload your first track
            </PrimaryButton>
          </EmptyState>
        )}

        {uploads.length > 0 && (
          <TrackList>
            {uploads.map((item: UploadedTrack) => {
              const isActive = activeUploadId === item.upload.id;
              return (
                <div key={item.upload.id}>
                  <TrackRow
                    active={isActive}
                    onClick={() =>
                      setActiveUploadId(isActive ? null : item.upload.id)
                    }
                  >
                    <ArtworkBox>
                      {item.track.albumArt ? (
                        <>
                          <img
                            src={item.track.albumArt}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <ArtworkOverlay>
                            <IconPlayerPlay size={16} color="#fff" />
                          </ArtworkOverlay>
                        </>
                      ) : (
                        <IconMusic size={18} color="var(--color-text-muted)" />
                      )}
                    </ArtworkBox>

                    <TrackInfo>
                      <TrackTitle active={isActive}>{item.track.title}</TrackTitle>
                      <TrackMeta>
                        {item.track.artist}
                        {item.track.album && ` — ${item.track.album}`}
                      </TrackMeta>
                    </TrackInfo>

                    <Duration>{formatDuration(item.track.duration)}</Duration>

                    <DeleteBtn
                      className="delete-btn"
                      onClick={(e) => handleDelete(e, item.upload.id)}
                    >
                      <IconTrash size={15} />
                    </DeleteBtn>
                  </TrackRow>

                  {isActive && (
                    <PlayerWrap>
                      <TrackPlayer uploadId={item.upload.id} />
                    </PlayerWrap>
                  )}
                </div>
              );
            })}
          </TrackList>
        )}
      </Page>
    </Main>
  );
}
