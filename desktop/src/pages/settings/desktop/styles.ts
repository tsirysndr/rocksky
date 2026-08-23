import styled from "@emotion/styled";

// Desktop-settings-specific controls, matching the look of the audio
// settings page (see ../audio/styles.ts, notably Select).

export const TextInput = styled.input`
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 10px;
  font-family: RockfordSansMedium;
  font-size: 0.8rem;
  min-width: 180px;
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
  &:disabled {
    opacity: 0.5;
  }
`;

export const NumberInput = styled(TextInput)`
  min-width: 90px;
  max-width: 110px;
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

export const Button = styled.button`
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 16px;
  font-family: RockfordSansMedium;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s ease;
  &:hover {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const GhostButton = styled(Button)`
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  &:hover {
    opacity: 1;
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`;

export const StatusDot = styled.span<{ on: boolean }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background: ${({ on }) => (on ? "#0bd674" : "var(--color-border)")};
`;

export const StatusLine = styled.div`
  display: flex;
  align-items: center;
  font-family: RockfordSansRegular;
  font-size: 0.8rem;
  color: var(--color-text);
`;

export const UsagePath = styled.div`
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem;
  color: var(--color-text-muted);
  word-break: break-all;
  margin-top: 4px;
`;
