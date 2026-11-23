import { useEffect, useRef, useState } from "react";

export default function HeroBackground() {
  const [variant] = useState(() => Math.floor(Math.random() * 3) + 1);
  const [ready, setReady] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const src = `${import.meta.env.BASE_URL}hero-albums-${variant}.webp`;

  useEffect(() => {
    const element = image.current;
    if (!element) return;
    let cancelled = false;
    void element.decode().then(
      () => {
        if (!cancelled && element.naturalWidth > 0) setReady(true);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      className={`hero-album-background${ready ? " is-ready" : ""}`}
      aria-hidden="true"
    >
      <div className="hero-album-veil">
        <img
          ref={image}
          className="hero-album-image"
          src={src}
          width={2560}
          height={1440}
          alt=""
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
      </div>
    </div>
  );
}
