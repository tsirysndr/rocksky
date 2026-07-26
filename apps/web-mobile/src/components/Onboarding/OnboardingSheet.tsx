import styled from "@emotion/styled";
import { IconArrowRight, IconSparkles, IconX } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { GET_STARTED_STEPS } from "./steps";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
`;

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
`;

const Sheet = styled.div`
  position: relative;
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: 12px 20px calc(28px + env(safe-area-inset-bottom));
  background: var(--color-surface);
`;

const Grip = styled.div`
  width: 40px;
  height: 4px;
  border-radius: 999px;
  margin: 0 auto 18px;
  background: var(--color-border);
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
`;

const Badge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 40, 118, 0.14);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const Title = styled.h2`
  color: var(--color-text);
  font-size: 21px;
  line-height: 1.25;
  margin: 14px 0 6px;
`;

const Subtitle = styled.p`
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 20px;
`;

const StepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const StepCard = styled.button`
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  cursor: pointer;
`;

const IconBubble = styled.div<{ accent: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  color: ${({ accent }) => accent};
  background: ${({ accent }) => `${accent}22`};
`;

const StepBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const StepTitle = styled.div`
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
`;

const StepDesc = styled.div`
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.4;
`;

const Arrow = styled.div`
  color: var(--color-text-muted);
  flex-shrink: 0;
`;

const SkipButton = styled.button`
  display: block;
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
`;

export type OnboardingSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  displayName?: string;
};

function OnboardingSheet({ isOpen, onClose, displayName }: OnboardingSheetProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const go = (step: { to: string; external?: boolean }) => {
    onClose();
    if (step.external) {
      window.open(step.to, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(step.to);
  };

  return (
    <Overlay onClick={onClose}>
      <Backdrop />
      <Sheet onClick={(e) => e.stopPropagation()}>
        <Grip />
        <CloseButton onClick={onClose} aria-label="Close">
          <IconX size={20} style={{ color: "var(--color-text-muted)" }} />
        </CloseButton>

        <Badge>
          <IconSparkles size={13} /> Welcome to Rocksky
        </Badge>
        <Title>
          {displayName ? `Hey ${displayName}, ` : "Hey there, "}
          let&apos;s fill up your profile
        </Title>
        <Subtitle>
          Your profile is empty for now. Pick one of these to start building
          your listening history.
        </Subtitle>

        <StepList>
          {GET_STARTED_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <StepCard key={step.title} onClick={() => go(step)}>
                <IconBubble accent={step.accent}>
                  <Icon size={22} />
                </IconBubble>
                <StepBody>
                  <StepTitle>{step.title}</StepTitle>
                  <StepDesc>{step.description}</StepDesc>
                </StepBody>
                <Arrow>
                  <IconArrowRight size={18} />
                </Arrow>
              </StepCard>
            );
          })}
        </StepList>

        <SkipButton onClick={onClose}>I&apos;ll explore on my own</SkipButton>
      </Sheet>
    </Overlay>
  );
}

export default OnboardingSheet;
