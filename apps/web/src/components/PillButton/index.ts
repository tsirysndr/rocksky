import styled from "@emotion/styled";

// The playlist detail pages' control styling: one solid pill for the primary
// action, a ghost for the rest.

const pill = `
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 22px;
  border: none;
  border-radius: 999px;
  background: var(--color-text);
  color: var(--color-background);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  text-decoration: none;
  cursor: pointer;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

export const PillButton = styled.button`
  ${pill}
`;

export const PillLink = styled.a`
  ${pill}
`;

export const GhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  padding: 10px 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;

  &:hover { color: var(--color-text); }
  &:disabled { opacity: 0.4; cursor: default; }
`;
