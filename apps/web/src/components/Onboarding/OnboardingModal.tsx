import styled from "@emotion/styled";
import { useNavigate } from "@tanstack/react-router";
import { Modal, ModalBody } from "baseui/modal";
import { IconArrowRight, IconSparkles } from "@tabler/icons-react";
import { GET_STARTED_STEPS } from "./steps";

const Container = styled.div`
  padding: 8px 8px 16px;
`;

const Badge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 40, 118, 0.12);
  color: #ff2876;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
`;

const Title = styled.h1`
  color: var(--color-text);
  font-size: 26px;
  line-height: 1.2;
  margin: 18px 0 6px;
`;

const Subtitle = styled.p`
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.5;
  margin: 0 0 24px;
`;

const StepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StepCard = styled.button`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: left;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-menu-hover);
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--color-primary);
  }
`;

const IconBubble = styled.div<{ accent: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  color: ${({ accent }) => accent};
  background: ${({ accent }) => `${accent}22`};
`;

const StepBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const StepTitle = styled.div`
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 3px;
`;

const StepDesc = styled.div`
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.4;
`;

const Arrow = styled.div`
  color: var(--color-text-muted);
  flex-shrink: 0;
`;

const Footer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 22px;
`;

const SkipButton = styled.button`
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
`;

export type OnboardingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  displayName?: string;
};

function OnboardingModal(props: OnboardingModalProps) {
  const { isOpen, onClose, displayName } = props;
  const navigate = useNavigate();

  const go = (step: { to: string; external?: boolean }) => {
    onClose();
    if (step.external) {
      window.open(step.to, "_blank", "noopener,noreferrer");
      return;
    }
    navigate({ to: step.to as string });
  };

  return (
    <Modal
      size="auto"
      onClose={onClose}
      isOpen={isOpen}
      overrides={{
        Root: { style: { zIndex: 50 } },
        Dialog: {
          style: {
            backgroundColor: "var(--color-background)",
            maxWidth: "560px",
            width: "92vw",
          },
        },
        Close: {
          style: {
            color: "var(--color-text)",
            ":hover": { color: "var(--color-text)", opacity: 0.8 },
          },
        },
      }}
    >
      <ModalBody style={{ marginTop: 0 }}>
        <Container>
          <Badge>
            <IconSparkles size={14} /> Welcome to Rocksky
          </Badge>
          <Title>
            {displayName ? `Hey ${displayName}, ` : "Hey there, "}
            let&apos;s get your profile going
          </Title>
          <Subtitle>
            Your profile is empty right now. Pick one of these to start
            building your listening history — it only takes a minute.
          </Subtitle>

          <StepList>
            {GET_STARTED_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <StepCard key={step.title} onClick={() => go(step)}>
                  <IconBubble accent={step.accent}>
                    <Icon size={24} />
                  </IconBubble>
                  <StepBody>
                    <StepTitle>{step.title}</StepTitle>
                    <StepDesc>{step.description}</StepDesc>
                  </StepBody>
                  <Arrow>
                    <IconArrowRight size={20} />
                  </Arrow>
                </StepCard>
              );
            })}
          </StepList>

          <Footer>
            <SkipButton onClick={onClose}>
              I&apos;ll explore on my own
            </SkipButton>
          </Footer>
        </Container>
      </ModalBody>
    </Modal>
  );
}

export default OnboardingModal;
