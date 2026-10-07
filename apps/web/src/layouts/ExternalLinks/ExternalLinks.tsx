import RecordingMetadata from "../../components/RecordingMetadata";
import styled from "@emotion/styled";
import { Spotify } from "@styled-icons/boxicons-logos";
import { useRouter } from "@tanstack/react-router";
import { LabelLarge } from "baseui/typography";
import { useAtomValue } from "jotai";
import { songAtom } from "../../atoms/song";

const Link = styled.a`
  display: inline-flex;
  align-items: center;
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
    pathname.includes("/scrobble/") || pathname.includes("/song/");
  return (
    <>
      {display &&
        (song?.spotifyLink || song?.mbId?.trim() || song?.isrc?.trim()) && (
          <div className="mt-[50px]">
            <LabelLarge
              marginBottom={"10px"}
              className="!text-[var(--color-text)]"
            >
              External Links
            </LabelLarge>
            {song?.spotifyLink && (
              <Link
                href={song.spotifyLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Spotify size={25} color="#1dd05d" />
                <span className="!text-[var(--color-text)] ml-[10px]">
                  Spotify
                </span>
              </Link>
            )}
            <RecordingMetadata mbId={song?.mbId} isrc={song?.isrc} />
          </div>
        )}
    </>
  );
}

export default ExternalLinks;
