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
