import styled from "@emotion/styled";

export const tabOverrides = {
  Tab: {
    style: {
      color: "var(--color-text)",
      backgroundColor: "var(--color-background) !important",
    },
  },
  TabPanel: {
    style: { paddingTop: "16px", paddingBottom: "0", paddingLeft: "0", paddingRight: "0" },
  },
};

export const tabsOverrides = {
  TabHighlight: { style: { backgroundColor: "var(--color-purple)" } },
  TabBorder: { style: { display: "none" } },
};

export const PlayButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

export const PlayBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border: none;
  background: var(--color-text);
  color: var(--color-background);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  border-radius: 999px;
  cursor: pointer;
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

export const ShuffleBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  &:hover:not(:disabled) { color: var(--color-text); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

export const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const TrackRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 0;
  border-radius: 12px;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
  & .track-actions { opacity: 0; }
  &:hover .track-actions { opacity: 1; }
  &:hover .artwork-overlay { opacity: 1; }
`;

export const TrackNum = styled.span`
  width: 28px;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
`;

export const ArtworkBox = styled.div`
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

export const ArtworkOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
`;

export const TrackInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const TrackTitle = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text);
`;

export const TrackMeta = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Duration = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
`;

export const MenuWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`;

export const MenuBtn = styled.button`
  padding: 5px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); color: var(--color-text); }
`;

export const MenuItem = styled.button`
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  border-radius: 8px;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px;
`;

export const AlbumCard = styled.div`
  cursor: pointer;
  &:hover .album-art-wrap { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
  &:hover .album-actions { opacity: 1; pointer-events: auto; }
`;

export const AlbumArtContainer = styled.div`
  position: relative;
  margin-bottom: 10px;
`;

export const AlbumArtWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  background: var(--color-menu-hover);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
`;

export const AlbumActionsOverlay = styled.div`
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  z-index: 2;
  & > * { flex: 1; display: flex; justify-content: center; }
`;

export const AlbumFloatBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  flex-shrink: 0;
  &:hover { background: rgba(0,0,0,0.8); }
`;

export const AlbumName = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const AlbumArtistName = styled.p`
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ArtistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 20px;
`;

export const ArtistCard = styled.div`
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  &:hover .artist-avatar { transform: scale(1.04); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
`;

export const ArtistAvatar = styled.div`
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--color-menu-hover);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
  font-size: 2rem;
  font-family: RockfordSansBold;
  color: var(--color-text-muted);
`;

export const ArtistNameLabel = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 96px 0;
  color: var(--color-text-muted);
`;

export const EmptyTitle = styled.p`
  margin: 0;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

export const EmptySubtitle = styled.p`
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-align: center;
`;

export const PrimaryButton = styled.button`
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
  &:hover { opacity: 0.9; }
`;
