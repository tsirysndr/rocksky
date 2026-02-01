import { v4 } from "uuid";
import Header from "../components/Header";
import type { Profile } from "../types/profile";
import type { Scrobble } from "../types/scrobble";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export type RecentScrobblesEmbedPageProps = {
  profile: Profile;
  scrobbles: Scrobble[];
};

export function RecentScrobblesEmbedPage(props: RecentScrobblesEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <Header profile={props.profile} />
      <h2 className="m-[0px]">Recent Listens</h2>

      <div className="w-full overflow-x-auto">
        <table className="table-borderless table">
          <tbody>
            {props.scrobbles.map((scrobble, index) => (
              <tr key={v4()}>
                <td>
                  <div className="flex flex-row items-center">
                    <a
                      href={`https://rocksky.app/${scrobble.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                      target="_blank"
                      className="flex flex-row items-center no-underline text-inherit"
                    >
                      {scrobble.albumArt && (
                        <img
                          className="max-w-[60px] max-h-[60px] mr-[20px] rounded-[5px]"
                          src={scrobble.albumArt!}
                        />
                      )}
                      {!scrobble.albumArt && (
                        <div className="w-[60px] h-[60px] bg-[var(--color-avatar-background)] flex items-center justify-center mr-[20px]">
                          <div className="h-[30px] w-[30px]"></div>
                        </div>
                      )}
                      <div>
                        <div>{scrobble.title}</div>
                        <a
                          href={`https://rocksky.app/${scrobble.artistUri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                          target="_blank"
                          className="no-underline text-inherit"
                        >
                          <div className="font-rockford-light opacity-60">
                            {scrobble.albumArtist}
                          </div>
                        </a>
                      </div>
                    </a>
                  </div>
                </td>
                <td className="font-rockford-light opacity-60">
                  {dayjs(
                    scrobble.createdAt.endsWith("Z")
                      ? scrobble.createdAt
                      : `${scrobble.createdAt}Z`,
                  ).fromNow()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
