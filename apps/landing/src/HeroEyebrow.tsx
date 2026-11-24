import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  scrambleFrame,
  SCRAMBLE_DURATION,
  SCRAMBLE_PAUSE,
} from "./hero-scramble";

const lead = "MUSIC SCROBBLING ON";
const protocol = "AT PROTOCOL";
const text = `${lead} ${protocol}`;

export default function HeroEyebrow() {
  const element = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (reduce !== false) return;
    let visible = false;
    let frame = 0;
    let timer = 0;
    let started = 0;
    let lastTick = -1;

    function stop() {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      setDisplay(text);
    }
    function tick(now: number) {
      const elapsed = now - started;
      if (elapsed >= SCRAMBLE_DURATION) {
        setDisplay(text);
        timer = window.setTimeout(start, SCRAMBLE_PAUSE);
        return;
      }
      const currentTick = Math.floor(elapsed / (1000 / 30));
      if (currentTick !== lastTick) {
        lastTick = currentTick;
        setDisplay(scrambleFrame(text, elapsed));
      }
      frame = window.requestAnimationFrame(tick);
    }
    function start() {
      stop();
      if (!visible || document.hidden) return;
      started = performance.now();
      lastTick = -1;
      frame = window.requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    if (element.current) observer.observe(element.current);
    document.addEventListener("visibilitychange", start);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", start);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [reduce]);

  const shown = reduce ? text : display;
  return (
    <div ref={element} className="eyebrow hero-eyebrow">
      <span className="tiny-star" aria-hidden="true">
        ✳
      </span>
      <span className="hero-scramble">
        <span className="hero-eyebrow-label">{lead}</span>
        <span aria-hidden="true">{shown.slice(0, lead.length)}</span>
      </span>
      <a
        className="hero-protocol-link hero-scramble"
        href="https://atproto.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={protocol}
      >
        <span aria-hidden="true">{shown.slice(lead.length + 1)}</span>
      </a>
    </div>
  );
}
