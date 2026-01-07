import { Link, useParams } from "@tanstack/react-router";
import { useTracksQuery } from "../../../hooks/useLibrary";
import { getLastDays } from "../../../lib/date";

function TopTrack() {
  const { did } = useParams({ strict: false });
  const { data, isLoading } = useTracksQuery(did!, 0, 1, ...getLastDays(7));
  console.log(">> data", data);
  return (
    <>
      {!isLoading && data.length > 0 && (
        <div className="flex">
          <div className="flex flex-col items-end pr-[15px]">
            <h4
              className="text-[12px] opacity-60 m-[0px]"
              style={{ fontWeight: "bold" }}
            >
              TOP TRACK
            </h4>
            <Link
              to={data[0].uri?.split("at:/")[1]?.replace("app.rocksky.", "")}
              className="!text-[var(--color-text)] no-underline hover:underline"
            >
              <b className="text-[18px] truncate max-w-[500px]">
                {data[0].title}
              </b>
            </Link>

            <Link
              to={data[0].artistUri
                ?.split("at:/")[1]
                ?.replace("app.rocksky.", "")}
              className="text-[var(--color-text)] no-underline hover:underline"
            >
              <span className="opacity-90 text-[18px] truncate max-w-[500px]">
                {data[0].albumArtist}
              </span>
            </Link>
          </div>
          <Link
            to={data[0].albumUri?.split("at:/")[1]?.replace("app.rocksky.", "")}
          >
            <img
              src={data[0].albumArt}
              alt={"Addicted"}
              className="w-[70px] h-[70px]"
            />
          </Link>
        </div>
      )}
    </>
  );
}

export default TopTrack;
