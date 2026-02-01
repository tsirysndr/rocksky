import { v4 } from "uuid";
import Header from "../components/Header";
import type { Profile } from "../types/profile";
import type { Track } from "../types/track";
import dayjs from "dayjs";

export type TopTracksEmbedPageProps = {
  profile: Profile;
  tracks: Track[];
};

export function TopTracksEmbedPage(props: TopTracksEmbedPageProps) {
  const end = dayjs();
  const start = end.subtract(7, "day");
  const range = `${start.format("DD MMM YYYY")} — ${end.format("DD MMM YYYY")}`;

  return (
    <div className="p-[15px]">
      <Header profile={props.profile} />
      <h2 className="m-[0px]">Top Tracks</h2>
      <div className="text-[14px] mt-[3px] mb-[20px]">{range}</div>
      <div className="w-full overflow-x-auto">
        <table className="table-borderless table">
          <tbody>
            {props.tracks.map((track, index) => (
              <tr key={v4()}>
                <td>
                  <div className="flex flex-row items-center">
                    <div className="mr-[20px] min-w-[30px]">{index + 1}</div>
                    <a
                      href={`https://rocksky.app/${track.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                      target="_blank"
                      className="flex flex-row items-center no-underline text-inherit"
                    >
                      {track.albumArt && (
                        <img
                          className="max-w-[60px] max-h-[60px] mr-[20px] rounded-[5px]"
                          src={track.albumArt!}
                        />
                      )}
                      {!track.albumArt && (
                        <div className="w-[60px] h-[60px] bg-[var(--color-avatar-background)] flex items-center justify-center mr-[20px]">
                          <div className="h-[30px] w-[30px]"></div>
                        </div>
                      )}
                      <div>
                        <div>{track.title}</div>
                        <a
                          href={`https://rocksky.app/${track.artistUri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                          target="_blank"
                          className="no-underline text-inherit"
                        >
                          <div className="font-rockford-light opacity-60">
                            {track.albumArtist}
                          </div>
                        </a>
                      </div>
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
