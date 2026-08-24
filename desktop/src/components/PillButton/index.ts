import styled from "@emotion/styled";

// The library's "Upload Music" colours in a pill, plus a ghost for secondary
// actions.

const pill = `
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 22px;
  border: none;
  border-radius: 999px;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  text-decoration: none;
  cursor: pointer;

  &:hover { background: color-mix(in srgb, var(--color-primary) 15%, transparent); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

export const PillButton = styled.button`
  ${pill}
`;

export const PillLink = styled.a`
  ${pill}
`;

const ghost = `
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
  text-decoration: none;
  cursor: pointer;

  &:hover { color: var(--color-text); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

export const GhostButton = styled.button`
  ${ghost}
`;

export const GhostLink = styled.a`
  ${ghost}
`;
