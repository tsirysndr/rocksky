import { HeadingSmall, ParagraphMedium } from "baseui/typography";

function TopAlbums() {
  return (
    <>
      <HeadingSmall>Top Albums</HeadingSmall>
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

export default TopAlbums;
