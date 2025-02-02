import { HeadingSmall, ParagraphMedium } from "baseui/typography";

function RecentTracks() {
  return (
    <>
      <HeadingSmall>Recent Tracks</HeadingSmall>
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

export default RecentTracks;
