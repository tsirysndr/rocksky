import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconMusic,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { EXPLORE_STEPS, GET_STARTED_STEPS, type OnboardingStep } from "./steps";

const Wrapper = styled.div`
  margin-top: 40px;
`;

const Hero = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px;
  border-radius: 18px;
  background: linear-gradient(
    135deg,
    rgba(255, 40, 118, 0.14),
    rgba(155, 92, 255, 0.12)
  );
  border: 1px solid var(--color-border);
  margin-bottom: 32px;
`;

const HeroIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--color-primary);
  color: #fff;
`;

const HeroBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const HeroTitle = styled.h2`
  color: var(--color-text);
  font-size: 22px;
  margin: 0 0 6px;
`;

const HeroText = styled.p`
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.5;
  margin: 0 0 16px;
`;

const HeroButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  border-radius: 999px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    opacity: 0.92;
  }
`;

const SectionTitle = styled.div`
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin: 0 0 16px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const cardStyle = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-menu-hover);
  text-decoration: none;
  transition: transform 0.12s ease, border-color 0.12s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-primary);
  }
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
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: ${({ accent }) => accent};
  background: ${({ accent }) => `${accent}22`};
`;

const CardTitle = styled.div`
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
`;

const CardDesc = styled.div`
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.45;
  flex: 1;
`;

const CardCta = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
`;

const ExploreRow = styled.div`
  margin-top: 36px;
`;

function StepCard({ step }: { step: OnboardingStep }) {
  const Icon = step.icon;
  const inner = (
    <>
      <CardIcon accent={step.accent}>
        <Icon size={22} />
      </CardIcon>
      <CardTitle>{step.title}</CardTitle>
      <CardDesc>{step.description}</CardDesc>
      <CardCta>
        {step.cta} <IconArrowRight size={15} />
      </CardCta>
    </>
  );

  if (step.external) {
    return (
      <CardExternal href={step.to} target="_blank" rel="noopener noreferrer">
        {inner}
      </CardExternal>
    );
  }
  return <Card to={step.to as string}>{inner}</Card>;
}

export type NewUserGuideProps = {
  displayName?: string;
  onShowSteps: () => void;
};

function NewUserGuide(props: NewUserGuideProps) {
  const { displayName, onShowSteps } = props;

  return (
    <Wrapper>
      <Hero>
        <HeroIcon>
          <IconMusic size={32} />
        </HeroIcon>
        <HeroBody>
          <HeroTitle>
            {displayName ? `Welcome, ${displayName}!` : "Welcome to Rocksky!"}
          </HeroTitle>
          <HeroText>
            This is your music profile. It&apos;s empty for now — connect a
            source below and it&apos;ll fill up with your scrobbles, top
            artists, albums and more.
          </HeroText>
          <HeroButton onClick={onShowSteps}>
            <IconPlayerPlay size={16} /> Show me how to get started
          </HeroButton>
        </HeroBody>
      </Hero>

      <SectionTitle>Get your music in</SectionTitle>
      <Grid>
        {GET_STARTED_STEPS.map((step) => (
          <StepCard key={step.title} step={step} />
        ))}
      </Grid>

      <ExploreRow>
        <SectionTitle>While you&apos;re here</SectionTitle>
        <Grid>
          {EXPLORE_STEPS.map((step) => (
            <StepCard key={step.title} step={step} />
          ))}
        </Grid>
      </ExploreRow>
    </Wrapper>
  );
}

export default NewUserGuide;
