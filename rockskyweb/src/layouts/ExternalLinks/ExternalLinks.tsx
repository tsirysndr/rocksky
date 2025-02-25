import styled from "@emotion/styled";
import { Spotify } from "@styled-icons/boxicons-logos";
import { LabelLarge } from "baseui/typography";
import { useAtomValue } from "jotai";
import { useLocation } from "react-router";
import { artistAtom } from "../../atoms/artist";

const Link = styled.a`
  text-decoration: none;
  color: #000;
  &:hover {
    text-decoration: underline;
  }
`;

function ExternalLinks() {
  const artist = useAtomValue(artistAtom);
  const location = useLocation();
  const { pathname } = location;
  const display =
    pathname.includes("app.rocksky.scrobble") ||
    pathname.includes("app.rocksky.song");
  return (
    <>
      {display && artist?.spotifyLink && (
        <div style={{ marginTop: 50 }}>
          <LabelLarge marginBottom={"10px"}>External Links</LabelLarge>
          <Link href={artist?.spotifyLink} target="_blank">
            <Spotify size={25} color="#1dd05d" />
            <span style={{ marginLeft: 10 }}>Spotify</span>
          </Link>
        </div>
      )}
    </>
  );
}

export default ExternalLinks;
