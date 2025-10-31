import { Link } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { HeadingSmall } from "baseui/typography";

interface ArtistListenersProps {
  listeners: {
    id: string;
    did: string;
    handle: string;
    displayName: string;
    avatar: string;
    mostListenedSong: {
      title: string;
      uri: string;
      playCount: number;
    };
    totalPlays: number;
    rank: number;
  }[];
}

function ArtistListeners(props: ArtistListenersProps) {
  return (
    <>
      <HeadingSmall
        marginBottom={"15px"}
        className="!text-[var(--color-text)] !mb-[30px]"
      >
        Listeners
      </HeadingSmall>
      {props.listeners?.map((item) => (
        <div
          key={item.id}
          className="mb-[30px] flex flex-row items-center gap-[20px]"
        >
          <Link
            to={`/profile/${item.handle}` as string}
            className="no-underline"
          >
            <Avatar src={item.avatar} name={item.displayName} size={"60px"} />
          </Link>
          <div>
            <Link
              to={`/profile/${item.handle}` as string}
              className="text-[var(--color-text)] hover:underline no-underline"
              style={{ fontWeight: 600 }}
            >
              @{item.handle}
            </Link>
            <div className="!text-[14px] mt-[5px]">
              Listens to{" "}
              {item.mostListenedSong.uri && (
                <Link
                  to={`${item.mostListenedSong.uri?.split("at:/")[1].replace("app.rocksky.", "")}`}
                  className="text-[var(--color-primary)] hover:underline no-underline"
                >
                  {item.mostListenedSong.title}
                </Link>
              )}
              {!item.mostListenedSong.uri && (
                <span style={{ fontWeight: 600 }}>
                  {item.mostListenedSong.title}
                </span>
              )}{" "}
              a lot
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default ArtistListeners;
