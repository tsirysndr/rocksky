import styled from "@emotion/styled";

// The Navbar is position: fixed, 80px tall, and Main's Flex only offsets the
// inner column by 50px. So push the settings header down another 50px so the
// title sits below the navbar with breathing room.
//
// padding-bottom: the StickyPlayer is fixed at the bottom of the viewport
// (~128px tall). Main's Flex adds 200px margin-bottom which is mostly eaten
// by the player; we add 200px more here so the last EQ slider always clears
// it by a comfortable margin when scrolled to the end.
export const PageWrap = styled.div`
  padding-top: 50px;
  padding-bottom: 200px;
`;

export const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 28px;
`;

export const Title = styled.h1`
  font-family: RockfordSansMedium;
  font-size: 1.6rem;
  color: var(--color-text);
  margin: 0;
`;

export const Subtitle = styled.p`
  font-family: RockfordSansRegular;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0;
`;

export const TabStrip = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 28px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

export const Tab = styled.button<{ active: boolean }>`
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ active }) => (active ? "var(--color-primary)" : "transparent")};
  color: ${({ active }) =>
    active ? "var(--color-text)" : "var(--color-text-muted)"};
  font-family: RockfordSansMedium;
  font-size: 0.85rem;
  padding: 12px 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
  &:hover {
    color: var(--color-text);
  }
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

export const Card = styled.div`
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px 24px;
  background: var(--color-card-background, transparent);
`;

export const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
`;

export const CardTitle = styled.h2`
  font-family: RockfordSansMedium;
  font-size: 0.95rem;
  color: var(--color-text);
  margin: 0;
`;

export const CardHint = styled.p`
  font-family: RockfordSansRegular;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 4px 0 0 0;
  line-height: 1.4;
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  &:not(:last-child) {
    border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
  }
`;

export const Label = styled.label`
  font-family: RockfordSansMedium;
  font-size: 0.8rem;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const LabelHint = styled.span`
  font-family: RockfordSansRegular;
  font-size: 0.7rem;
  color: var(--color-text-muted);
`;

export const Value = styled.span`
  font-family: RockfordSansMedium;
  font-size: 0.8rem;
  color: var(--color-text);
  min-width: 56px;
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

export const Slider = styled.input`
  flex: 1;
  max-width: 240px;
  cursor: pointer;
  /* Fully custom track + thumb: WKWebView ignores accent-color on range
     inputs and its native track is invisible on the dark theme. */
  appearance: none;
  -webkit-appearance: none;
  height: 4px;
  border-radius: 2px;
  background: rgba(150, 150, 172, 0.6);
  background: color-mix(in srgb, var(--color-text) 45%, transparent);
  outline: none;

  &::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    background: var(--color-primary);
    box-shadow: 0 0 6px var(--range-glow), 0 0 14px var(--range-glow);
  }

  &::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: rgba(150, 150, 172, 0.6);
    background: color-mix(in srgb, var(--color-text) 45%, transparent);
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    background: var(--color-primary);
    box-shadow: 0 0 6px var(--range-glow), 0 0 14px var(--range-glow);
  }
`;

export const SliderRow = styled(Row)`
  gap: 20px;
`;

export const Select = styled.select`
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 10px;
  font-family: RockfordSansMedium;
  font-size: 0.8rem;
  cursor: pointer;
  min-width: 140px;
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

export const Toggle = styled.button<{ on: boolean }>`
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: ${({ on }) =>
    on ? "var(--color-primary)" : "var(--color-border)"};
  border: none;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ on }) => (on ? "18px" : "2px")};
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.2s;
  }
`;

export const LoadingState = styled.div`
  color: var(--color-text-muted);
  font-family: RockfordSansRegular;
  font-size: 0.85rem;
  padding: 24px 0;
  text-align: center;
`;

// Matches the back button on the library detail pages. This page has no
// `/settings` parent to return to — it's opened from the sticky player and
// from a keyboard shortcut — so it goes back through history instead.
export const BackBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 8px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  border-radius: 10px;
  margin-bottom: 16px;
  &:hover { background: var(--color-menu-hover); color: var(--color-text); }
`;
