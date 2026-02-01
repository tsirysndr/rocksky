import { v4 } from "uuid";
import type { Artist } from "../types/artist";
import type { Profile } from "../types/profile";
import ArtistIcon from "../components/Icons/Artist";
import dayjs from "dayjs";
import Header from "../components/Header";

export type TopArtistsEmbedPageProps = {
  profile: Profile;
  artists: Artist[];
};

export function TopArtistsEmbedPage(props: TopArtistsEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <Header profile={props.profile} />
      <h2 className="m-[0px] mb-[15px]">Top Artists</h2>

      <div className="w-full overflow-x-auto">
        <table className="table-borderless table">
          <tbody>
            {props.artists.map((artist, index) => (
              <tr key={v4()}>
                <td>
                  <div className="flex flex-row items-center">
                    <div className="mr-[20px] min-w-[30px]">{index + 1}</div>
                    <a
                      href={`https://rocksky.app/${artist.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                      target="_blank"
                      className="flex flex-row items-center no-underline text-inherit"
                    >
                      {artist.picture && (
                        <img
                          className="max-w-[60px] max-h-[60px] rounded-full mr-[20px]"
                          src={artist.picture!}
                        />
                      )}
                      {!artist.picture && (
                        <div className="w-[60px] h-[60px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center mr-[20px]">
                          <div className="h-[30px] w-[30px]">
                            <ArtistIcon />
                          </div>
                        </div>
                      )}
                      <div>{artist.name}</div>
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
