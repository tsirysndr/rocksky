import dayjs from "dayjs";
import type { Profile } from "../types/profile";
import type { Scrobble } from "../types/scrobble";

export type ScrobbleEmbedPageProps = {
  profile: Profile;
  scrobble: Scrobble;
};

export function ScrobbleEmbedPage(props: ScrobbleEmbedPageProps) {
  console.log("ScrobbleEmbedPage props:", props);
  return (
    <div className="p-[15px] flex items-center justify-center">
      <div className="">
        <a
          href={`https://rocksky.app/${props.scrobble.uri.split("at://")[1]?.replace("app.rocksky.", "")}`}
          className=" no-underline"
          target="_blank"
        >
          <img
            className="max-h-[250px] max-w-[250px] rounded-[8px] mb-[5px]"
            src={props.scrobble.cover}
          />
        </a>
        <a
          href={`https://rocksky.app/${props.scrobble.uri.split("at://")[1]?.replace("app.rocksky.", "")}`}
          className="text-inherit no-underline"
          target="_blank"
        >
          <div>{props.scrobble.title}</div>
        </a>
        <div className="text-black bg-[#00fff3] w-fit">
          {props.scrobble.artist}
        </div>
        <div className="flex items-center mt-[10px]">
          <a>
            <img
              src={props.profile.avatar}
              className="max-h-[25px] max-w-[25px] rounded-full mr-[10px]"
            />
          </a>

          <a
            href={`https://rocksky.app/profile/${props.profile.handle}`}
            className="text-[#ff2876] no-underline"
            target="_blank"
          >
            @{props.profile.handle}
          </a>
        </div>
        <div className="-[14px]">played this song</div>
        <div className="font-rockford-light text-[var(--color-text-muted)] text-[14px]">
          {dayjs(props.scrobble.date).format("MMM D, YYYY [at] h:mm A")}
        </div>
      </div>
    </div>
  );
}
