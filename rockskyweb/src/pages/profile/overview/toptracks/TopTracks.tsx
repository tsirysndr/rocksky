import { HeadingSmall, ParagraphMedium } from "baseui/typography";

function TopTracks() {
  return (
    <div>
      <HeadingSmall>Top Tracks</HeadingSmall>
      <ParagraphMedium
        style={{
          textAlign: "center",
        }}
        width={"100%"}
      >
        You haven't listened to any music yet.
      </ParagraphMedium>
    </div>
  );
}

export default TopTracks;
