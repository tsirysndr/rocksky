import { css } from "@emotion/react";
import styled from "@emotion/styled";
import {
  IconArrowRight,
  IconMusic,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { EXPLORE_STEPS, GET_STARTED_STEPS, type OnboardingStep } from "./steps";

const Wrapper = styled.div`
  padding-top: 8px;
`;

const Hero = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 18px;
  background: linear-gradient(
    135deg,
    rgba(255, 40, 118, 0.16),
    rgba(155, 92, 255, 0.14)
  );
  border: 1px solid var(--color-border);
  margin-bottom: 26px;
`;

const HeroTop = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const HeroIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--color-primary);
  color: #fff;
`;

const HeroTitle = styled.h2`
  color: var(--color-text);
  font-size: 19px;
  margin: 0;
`;

const HeroText = styled.p`
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
`;

const HeroButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px;
  border-radius: 999px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
`;

const SectionTitle = styled.div`
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin: 0 0 14px;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const cardStyle = css`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  text-decoration: none;
`;

const Card = styled(Link)`
  ${cardStyle}
`;

const CardExternal = styled.a`
  ${cardStyle}
`;

const CardIcon = styled.div<{ accent: string }>`
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

const CardBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardTitle = styled.div`
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 3px;
`;

const CardDesc = styled.div`
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.4;
`;

const Arrow = styled.div`
  color: var(--color-text-muted);
  flex-shrink: 0;
`;

const ExploreRow = styled.div`
  margin-top: 30px;
`;

function StepCard({ step }: { step: OnboardingStep }) {
  const Icon = step.icon;
  const inner = (
    <>
      <CardIcon accent={step.accent}>
        <Icon size={22} />
      </CardIcon>
      <CardBody>
        <CardTitle>{step.title}</CardTitle>
        <CardDesc>{step.description}</CardDesc>
      </CardBody>
      <Arrow>
        <IconArrowRight size={18} />
      </Arrow>
    </>
  );

  if (step.external) {
    return (
      <CardExternal href={step.to} target="_blank" rel="noopener noreferrer">
        {inner}
      </CardExternal>
    );
  }
  return <Card to={step.to}>{inner}</Card>;
}

export type NewUserGuideProps = {
  displayName?: string;
  onShowSteps: () => void;
};

function NewUserGuide({ displayName, onShowSteps }: NewUserGuideProps) {
  return (
    <Wrapper>
      <Hero>
        <HeroTop>
          <HeroIcon>
            <IconMusic size={28} />
          </HeroIcon>
          <div>
            <HeroTitle>
              {displayName ? `Welcome, ${displayName}!` : "Welcome to Rocksky!"}
            </HeroTitle>
          </div>
        </HeroTop>
        <HeroText>
          This is your music profile. It&apos;s empty for now — connect a source
          below and it&apos;ll fill up with your scrobbles, top artists and
          albums.
        </HeroText>
        <HeroButton onClick={onShowSteps}>
          <IconPlayerPlay size={16} /> Show me how to get started
        </HeroButton>
      </Hero>

      <SectionTitle>Get your music in</SectionTitle>
      <List>
        {GET_STARTED_STEPS.map((step) => (
          <StepCard key={step.title} step={step} />
        ))}
      </List>

      <ExploreRow>
        <SectionTitle>While you&apos;re here</SectionTitle>
        <List>
          {EXPLORE_STEPS.map((step) => (
            <StepCard key={step.title} step={step} />
          ))}
        </List>
      </ExploreRow>
    </Wrapper>
  );
}

export default NewUserGuide;
