import { HeadingSmall, ParagraphMedium } from "baseui/typography";

function TopArtists() {
  return (
    <>
      <HeadingSmall>Top Artists</HeadingSmall>
      <ParagraphMedium
        style={{
          textAlign: "center",
        }}
        width={"100%"}
      >
        You haven't listened to any music yet.
      </ParagraphMedium>
    </>
  );
}

export default TopArtists;
