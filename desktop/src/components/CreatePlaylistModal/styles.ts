// Shared chrome for the playlist modals. CreatePlaylistModal builds ATProto
// playlists from the global catalogue; LibraryPlaylistModal builds navidrome
// playlists from the user's own uploads. They are the same dialog with a
// different song source, so the styling lives here rather than in either.
import styled from "@emotion/styled";

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
`;

export const Panel = styled.div`
  /* The app ships @tailwind utilities without preflight, so there is no global
     box-sizing reset and boxes default to content-box: a width:100% input plus
     padding and border overflows its container to the right. Scope the reset to
     the modal rather than globally, which would shift the rest of the app. */
  &,
  & *,
  & *::before,
  & *::after {
    box-sizing: border-box;
  }

  width: 100%;
  max-width: 640px;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
`;

export const Title = styled.h2`
  font-family: RockfordSansBold;
  font-size: 18px;
  margin: 0;
  color: var(--color-text);
`;

export const Subtitle = styled.div`
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
`;

export const EscHint = styled.kbd`
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-muted);
  padding: 4px 7px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  flex-shrink: 0;
`;

export const Form = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const FieldLabel = styled.span`
  font-family: RockfordSansBold;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
`;

const inputStyles = `
  width: 100%;
  border-radius: 9px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  background: var(--color-input-background);
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 15px;
  padding: 11px 12px;
  outline: none;

  &:focus {
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

export const TextInput = styled.input<{ invalid?: boolean }>`
  ${inputStyles}
  border-color: ${({ invalid }) =>
    invalid ? "var(--color-primary)" : "rgba(128, 128, 128, 0.25)"};
`;

export const TextArea = styled.textarea<{ invalid?: boolean }>`
  ${inputStyles}
  resize: vertical;
  min-height: 84px;
  border-color: ${({ invalid }) =>
    invalid ? "var(--color-primary)" : "rgba(128, 128, 128, 0.25)"};
`;

export const ErrorText = styled.span`
  font-size: 12px;
  color: var(--color-primary);
`;

export const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
`;

export const QueryInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 18px;

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

export const AddError = styled.div`
  flex-shrink: 0;
  padding: 4px 18px 8px;
  color: var(--color-primary);
  font-size: 13px;
`;

// Same treatment as the global palette's section headings, so the playlist
// being added to reads as the heading for the results below it.
export const ContextLabel = styled.div`
  flex-shrink: 0;
  font-family: RockfordSansBold;
  font-size: 11px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 12px 18px 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Results = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
`;

export const Row = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 9px;
  background: ${({ active }) =>
    active ? "var(--color-menu-hover)" : "transparent"};
`;

export const Thumb = styled.div`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-skeleton-background);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 22px;
    height: 22px;
  }
`;

export const RowText = styled.div`
  min-width: 0;
  flex: 1;
`;

export const Primary = styled.div`
  color: var(--color-text);
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Secondary = styled.div`
  color: var(--color-text-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const AddButton = styled.button<{ added: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: RockfordSansMedium;
  font-size: 13px;
  padding: 6px 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: ${({ added }) =>
    added ? "var(--color-text-muted)" : "var(--color-primary)"};

  &:hover:not(:disabled) {
    text-decoration: underline;
  }

  &:disabled {
    cursor: default;
  }
`;

export const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
`;

export const Footer = styled.div<{ hints?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ hints }) => (hints ? "flex-start" : "space-between")};
  gap: 16px;
  flex-shrink: 0;
  padding: ${({ hints }) => (hints ? "9px 16px" : "14px 22px")};
  border-top: 1px solid rgba(128, 128, 128, 0.18);
  color: var(--color-text-muted);
  font-size: 12px;
`;

export const FootHint = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 5px;
  }
`;

export const FooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const Button = styled.button<{ kind?: "primary" | "ghost" }>`
  font-family: RockfordSansRegular;
  font-size: 14px;
  padding: 9px 18px;
  border-radius: 999px;
  cursor: pointer;
  border: 1px solid
    ${({ kind }) =>
      kind === "primary" ? "transparent" : "rgba(128, 128, 128, 0.3)"};
  background: ${({ kind }) =>
    kind === "primary" ? "var(--color-primary)" : "transparent"};
  color: ${({ kind }) => (kind === "primary" ? "#fff" : "var(--color-text)")};

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

/** Name/description validation, shared so both modals reject the same input. */
export const NAME_MAX = 512;
export const DESCRIPTION_MAX = 256;
