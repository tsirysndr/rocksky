import { HeadingSmall } from "baseui/typography";
import useLibrary from "../../../hooks/useLibrary";

function LovedTracks() {
  const { getLovedTracks } = useLibrary();

  return (
    <>
      <HeadingSmall>Loved Tracks</HeadingSmall>
    </>
  );
}

export default LovedTracks;
