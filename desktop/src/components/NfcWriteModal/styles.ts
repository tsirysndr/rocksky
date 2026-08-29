import styled from "@emotion/styled";

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
`;

export const Panel = styled.div`
  &,
  & *,
  & *::before,
  & *::after {
    box-sizing: border-box;
  }

  width: 100%;
  max-width: 420px;
  padding: 28px 24px 20px;
  text-align: center;
  background: var(--color-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
`;

/* The pulse is the whole affordance: it says "the reader is listening, put the
   tag down" without a line of copy. It stops on success and on failure. */
export const Halo = styled.div<{ state: "waiting" | "ok" | "error" }>`
  width: 88px;
  height: 88px;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: ${({ state }) =>
    state === "error" ? "#ef4444" : state === "ok" ? "#0bd674" : "var(--color-primary)"};
  background: currentColor;
  opacity: 0.999;

  & > * {
    color: #fff;
  }

  ${({ state }) =>
    state === "waiting" &&
    `animation: nfc-pulse 1.6s ease-out infinite;

     @keyframes nfc-pulse {
       0%   { box-shadow: 0 0 0 0 currentColor; }
       70%  { box-shadow: 0 0 0 18px rgba(0, 0, 0, 0); }
       100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
     }`}
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
  margin-top: 6px;
  line-height: 1.5;
`;

export const TargetName = styled.div`
  font-family: RockfordSansMedium;
  font-size: 14px;
  color: var(--color-text);
  margin-top: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const TargetMeta = styled.div`
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ErrorText = styled.div`
  font-size: 13px;
  color: #ef4444;
  margin-top: 14px;
  line-height: 1.5;
`;

export const Actions = styled.div`
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
`;

export const Button = styled.button`
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-family: RockfordSansMedium;
  font-size: 0.8rem;
  cursor: pointer;
  &:hover {
    opacity: 0.85;
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

/** The PSC/PIN field shown for a contact card, which cannot be written
 *  without one. Monospace because the value is a code, not prose. */
export const SecretInput = styled.input`
  width: 100%;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-family: JetBrainsMono, monospace;
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  text-align: center;
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

export const SecretLabel = styled.label`
  display: block;
  margin-top: 12px;
  font-size: 0.8rem;
  color: var(--color-text-muted);
`;
