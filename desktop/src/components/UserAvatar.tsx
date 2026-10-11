import { IconUser } from "@tabler/icons-react";
import { useState, type CSSProperties } from "react";

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  size?: string | number;
  className?: string;
  style?: CSSProperties;
}

export default function UserAvatar({
  src,
  name,
  size = 48,
  className,
  style,
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const imageSrc = src?.trim();
  const showImage =
    imageSrc && !imageSrc.endsWith("/@jpeg") && imageSrc !== failedSrc;

  return (
    <span
      className={className}
      role="img"
      aria-label={name ? `${name}'s avatar` : "User avatar"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: "50%",
        backgroundColor: "var(--color-avatar-background, #8d2dff)",
        color: "#fff",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {showImage ? (
        <img
          src={imageSrc}
          alt=""
          onError={() => setFailedSrc(imageSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <IconUser aria-hidden="true" style={{ width: "55%", height: "55%" }} />
      )}
    </span>
  );
}
