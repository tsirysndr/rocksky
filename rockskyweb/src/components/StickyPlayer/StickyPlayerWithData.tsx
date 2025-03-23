import StickyPlayer from "./StrickyPlayer";

function StickyPlayerWithData() {
  const nowPlaying = {
    title: "OUT OUT (feat. Charli XCX & Saweetie)",
    artist: "Joel Corry",
    artistUri:
      "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlp5opmak2k",
    songUri:
      "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.song/3lhlhdt3htc2i",
    duration: 180000,
    progress: 120000,
  };

  return (
    <StickyPlayer
      nowPlaying={nowPlaying}
      onPlay={() => {}}
      onPause={() => {}}
      onPrevious={() => {}}
      onNext={() => {}}
      onSpeaker={() => {}}
      onEqualizer={() => {}}
      onPlaylist={() => {}}
      onSeek={() => {}}
      isPlaying={true}
    />
  );
}

export default StickyPlayerWithData;
