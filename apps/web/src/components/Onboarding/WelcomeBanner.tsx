import styled from "@emotion/styled";
import { IconPlayerPlay, IconX } from "@tabler/icons-react";

const Banner = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: linear-gradient(
    135deg,
    rgba(255, 40, 118, 0.14),
    rgba(155, 92, 255, 0.12)
  );
  margin-bottom: 20px;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Text = styled.div`
  flex: 1;
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.45;

  b {
    color: var(--color-text);
    font-weight: 700;
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const StartButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 999px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    opacity: 0.92;
  }
`;

const DismissButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  padding: 6px;
  cursor: pointer;
  border-radius: 8px;

  &:hover {
    color: var(--color-text);
  }
`;

export type WelcomeBannerProps = {
  displayName?: string;
  onShowSteps: () => void;
  onDismiss: () => void;
};

function WelcomeBanner({
  displayName,
  onShowSteps,
  onDismiss,
}: WelcomeBannerProps) {
  return (
    <Banner>
      <Text>
        <b>{displayName ? `Welcome, ${displayName}!` : "Welcome to Rocksky!"}</b>{" "}
        You haven&apos;t scrobbled anything yet — connect a music source to
        start tracking your listening and build your profile.
      </Text>
      <Actions>
        <StartButton onClick={onShowSteps}>
          <IconPlayerPlay size={15} /> Show me how to get started
        </StartButton>
        <DismissButton onClick={onDismiss} aria-label="Dismiss">
          <IconX size={18} />
        </DismissButton>
      </Actions>
    </Banner>
  );
}

export default WelcomeBanner;
