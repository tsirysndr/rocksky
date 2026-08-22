import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const MarqueeOuter = styled.div`
  overflow: hidden;
  white-space: nowrap;
  max-width: 100%;
`;

const marqueeScroll = (distance: number) => keyframes`
  0%, 12% { transform: translateX(0); }
  88%, 100% { transform: translateX(-${distance}px); }
`;

const MarqueeInner = styled.div<{ distance: number }>`
  display: inline-block;
  white-space: nowrap;
  ${({ distance }) =>
    distance > 0 &&
    css`
      animation: ${marqueeScroll(distance)} ${Math.max(6, distance / 25)}s
        linear infinite alternate;
    `}
`;

// Scrolls its content back and forth (with a pause at each end) only when it
// overflows the available width; short text just renders statically.
function ScrollingText({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () =>
      setDistance(Math.max(0, inner.scrollWidth - outer.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [children]);

  return (
    <MarqueeOuter ref={outerRef} className={className} style={style}>
      <MarqueeInner ref={innerRef} distance={distance}>
        {children}
      </MarqueeInner>
    </MarqueeOuter>
  );
}

export default ScrollingText;
