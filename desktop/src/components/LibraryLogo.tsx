import styled from "@emotion/styled";
import { IconCloud } from "@tabler/icons-react";
import type { LibraryKind } from "../api/remoteLibraries";
import jellyfin from "../assets/libraries/jellyfin.svg";
import navidrome from "../assets/libraries/navidrome.svg";
import plyr from "../assets/libraries/plyr.png";
import upnp from "../assets/libraries/upnp.svg";

const logos: Record<Exclude<LibraryKind, "plyr">, string> = {
  navidrome,
  jellyfin,
  upnp,
};

const Box = styled.span<{ size: number }>`
  width: ${(p) => p.size}px;
  height: ${(p) => p.size}px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const Tinted = styled.span<{ logo: string; size: number }>`
  display: inline-block;
  width: ${(p) => p.size}px;
  height: ${(p) => p.size}px;
  background-color: var(--color-text-muted);
  mask: url("${(p) => p.logo}") center / contain no-repeat;
  -webkit-mask: url("${(p) => p.logo}") center / contain no-repeat;
`;

export default function LibraryLogo({
  kind,
  size = 40,
}: {
  kind: LibraryKind | "uploaded";
  size?: number;
}) {
  const inner = Math.round(size * 0.7);
  return (
    <Box size={size}>
      {kind === "uploaded" ? (
        <IconCloud size={Math.round(size * 0.55)} color="var(--color-text-muted)" />
      ) : kind === "plyr" ? (
        <img
          src={plyr}
          alt=""
          width={inner}
          height={inner}
          style={{ borderRadius: Math.round(inner * 0.22) }}
        />
      ) : (
        <Tinted logo={logos[kind]} size={inner} />
      )}
    </Box>
  );
}
