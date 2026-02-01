import numeral from "numeral";
import { v4 as uuidv4 } from "uuid";

export type ProfileEmbedPageProps = {
  handle: string;
  avatarUrl: string;
  displayName: string;
  stats: {
    scrobbles: number;
    artists: number;
    lovedTracks: number;
  };
  topTrack: {
    title: string;
    artist: string;
    albumArtist: string;
    albumCoverUrl: string;
    trackUrl: string;
    artistUrl: string;
    albumUrl: string;
  };
  genres: string[];
};

export function ProfileEmbedPage(props: ProfileEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <a
        href="https://rocksky.app"
        className="text-inherit no-underline"
        target="_blank"
      >
        <div className="absolute top-[0] right-[0] m-[20px] flex flex-row items-center ">
          <img
            className="max-h-[18px] max-w-[18px] mr-[8px] "
            src="/public/logo.png"
          />
          <span className="text-[15px]">Rocksky</span>
        </div>
      </a>

      <div className="flex flex-row items-center mt-[10px] mb-[20px] w-full">
        <a href={`https://rocksky.app/profile/${props.handle}`} target="_blank">
          <img
            className="max-h-[100px] max-w-[100px] rounded-full mr-[25px]"
            src={props.avatarUrl}
          />
        </a>
        <div>
          <a
            href={`https://rocksky.app/profile/${props.handle}`}
            target="_blank"
            className="no-underline text-inherit"
          >
            <div className="text-[20px]">{props.displayName}</div>
          </a>
          <a
            className="text-[var(--color-text-muted)] no-underline"
            href={`https://bsky.app/profile/${props.handle}`}
            target="_blank"
          >
            @{props.handle}
          </a>
        </div>
      </div>

      <div className="mb-[25px]">
        {Array.from(new Set(props.genres))
          .slice(0, 10)
          .map((genre) => (
            <a
              key={uuidv4()}
              href={`https://rocksky.app/genre/${genre}`}
              className="mr-[10px] text-[14px] no-underline text-[var(--color-genre)]"
              target="_blank"
            >
              # {genre}
            </a>
          ))}
      </div>

      <div className="flex flex-row mb-[20px] w-full">
        <div className="mr-[20px] ">
          <div className="text-[var(--color-text-muted)] text-[13px]">
            SCROBBLES
          </div>
          <div className="text-[24px]">
            {numeral(props.stats.scrobbles).format("0,0")}
          </div>
        </div>
        <div className="mr-[20px]">
          <div className="text-[var(--color-text-muted)] text-[13px]">
            ARTISTS
          </div>
          <div className="text-[24px]">
            {numeral(props.stats.artists).format("0,0")}
          </div>
        </div>
        <div className="mr-[20px]">
          <div className="text-[var(--color-text-muted)] text-[13px]">
            LOVED TRACKS
          </div>
          <div className="text-[24px]">
            {numeral(props.stats.lovedTracks).format("0,0")}
          </div>
        </div>
      </div>

      <div className="flex flex-row justify-end w-full">
        <div className="flex flex-col items-end pr-[15px] text-[18px]">
          <div className="text-[12px] text-[var(--color-text-muted)]">
            TOP TRACK
          </div>
          <a
            href={props.topTrack.trackUrl}
            className="text-inherit no-underline hover:underline"
            target="_blank"
          >
            {props.topTrack.title}
          </a>
          <a
            href={props.topTrack.artistUrl}
            className="font-rockford-light text-inherit no-underline hover:underline"
            target="_blank"
          >
            {props.topTrack.albumArtist}
          </a>
        </div>
        <a href={props.topTrack.albumUrl} target="_blank">
          <img
            className="max-h-[70px] max-w-[70px]"
            src={props.topTrack.albumCoverUrl}
          />
        </a>
      </div>
    </div>
  );
}
