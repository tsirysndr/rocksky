import styled from "@emotion/styled";
import { Spotify } from "@styled-icons/boxicons-logos";
import { useRouter } from "@tanstack/react-router";
import { LabelLarge } from "baseui/typography";
import { useAtomValue } from "jotai";
import { songAtom } from "../../atoms/song";

const Link = styled.a`
  text-decoration: none;
  color: #000;
  &:hover {
    text-decoration: underline;
  }
`;

function ExternalLinks() {
  const song = useAtomValue(songAtom);
  const {
    state: {
      location: { pathname },
    },
  } = useRouter();
  const display =
    pathname.includes("app.rocksky.scrobble") ||
    pathname.includes("app.rocksky.song");
  return (
    <>
      {display && song?.spotifyLink && (
        <div className="mt-[50px]">
          <LabelLarge
            marginBottom={"10px"}
            className="!text-[var(--color-text)]"
          >
            External Links
          </LabelLarge>
          <Link href={song?.spotifyLink} target="_blank">
            <Spotify size={25} color="#1dd05d" />
            <span className="!text-[var(--color-text)] ml-[10px]">Spotify</span>
          </Link>
        </div>
      )}
    </>
  );
}

export default ExternalLinks;
