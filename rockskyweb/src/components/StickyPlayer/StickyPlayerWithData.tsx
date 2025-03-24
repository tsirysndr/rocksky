import axios from "axios";
import _ from "lodash";
import { useEffect, useState } from "react";
import { API_URL } from "../../consts";
import StickyPlayer from "./StrickyPlayer";

function StickyPlayerWithData() {
  /*const nowPlaying = {
    title: "OUT OUT (feat. Charli XCX & Saweetie)",
    artist: "Joel Corry",
    artistUri:
      "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlp5opmak2k",
    songUri:
      "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.song/3lhlhdt3htc2i",
    duration: 180000,
    progress: 120000,
  };*/

  const [nowPlaying, setNowPlaying] = useState<{
    title: string;
    artist: string;
    artistUri: string;
    songUri: string;
    duration: number;
    progress: number;
    albumArt?: string;
  } | null>(null);

  useEffect(() => {
    fetchCurrentlyPlaying();
  }, []);

  const fetchCurrentlyPlaying = async () => {
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: {
        authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    console.log(">>", data);
    if (data) {
      setNowPlaying({
        title: data.item.name,
        artist: data.item.artists[0].name,
        artistUri: data.item.artists[0].uri,
        songUri: data.item.uri,
        duration: data.item.duration_ms,
        progress: data.progress_ms,
        albumArt: _.get(data, "item.album.images.0.url"),
      });
    }
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
