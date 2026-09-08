import { Link, useParams, useRouter } from "@tanstack/react-router";
import { LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import numeral from "numeral";
import { Area, AreaChart, Tooltip, TooltipProps, XAxis } from "recharts";
import {
  useAlbumChartQuery,
  useArtistChartQuery,
  useGenreChartQuery,
  useProfileChartQuery,
  useScrobblesChartQuery,
  useSongChartQuery,
} from "../../hooks/useChart";

const CustomTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#fff] border-[1px] border-[#ccc] p-[5px]">
        <span className="text-[#808080]">
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {dayjs(label).format("dddd DD MMMM YYYY")}
          </span>
          :
        </span>
        <span className="text-[#710de4]">
          {" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {numeral(payload[0].value).format("0,0")}
          </span>
        </span>
      </div>
    );
  }

  return null;
};
const formatXAxis = (tickItem: string) => dayjs(tickItem).format("MMM D");

type Scope =
  | { kind: "global" }
  | { kind: "profile"; did: string }
  | { kind: "genre"; genre: string }
  | { kind: "artist"; uri: string }
  | { kind: "album"; uri: string }
  | { kind: "song"; uri: string };

// /library/{artist,album,playlist}/$id has no did/rkey, so those keep the
// site-wide chart and never fall into the entity branches below.
const resolveScope = (
  pathname: string,
  params: { did?: string; rkey?: string; id?: string },
): Scope => {
  const { did, rkey, id } = params;

  if (pathname.startsWith("/profile") && did) {
    return { kind: "profile", did };
  }

  if (pathname.startsWith("/genre/") && id) {
    return { kind: "genre", genre: id };
  }

  if (did && rkey) {
    if (pathname.includes("/artist/")) {
      return { kind: "artist", uri: `at://${did}/app.rocksky.artist/${rkey}` };
    }
    if (pathname.includes("/album/")) {
      return { kind: "album", uri: `at://${did}/app.rocksky.album/${rkey}` };
    }
    if (pathname.includes("/song/")) {
      return { kind: "song", uri: `at://${did}/app.rocksky.song/${rkey}` };
    }
    if (pathname.includes("/scrobble/")) {
      return { kind: "song", uri: `at://${did}/app.rocksky.scrobble/${rkey}` };
    }
  }

  return { kind: "global" };
};

function ScrobblesAreaChart() {
  const {
    state: {
      location: { pathname },
    },
  } = useRouter();
  const { did, rkey, id } = useParams({ strict: false });
  const scope = resolveScope(pathname, { did, rkey, id });

  const { data: globalChart } = useScrobblesChartQuery();
  const { data: profileChart } = useProfileChartQuery(
    scope.kind === "profile" ? scope.did : undefined,
  );
  const { data: genreChart } = useGenreChartQuery(
    scope.kind === "genre" ? scope.genre : undefined,
  );
  const { data: artistChart } = useArtistChartQuery(
    scope.kind === "artist" ? scope.uri : undefined,
  );
  const { data: albumChart } = useAlbumChartQuery(
    scope.kind === "album" ? scope.uri : undefined,
  );
  const { data: songChart } = useSongChartQuery(
    scope.kind === "song" ? scope.uri : undefined,
  );

  const scopedChart = {
    global: globalChart,
    profile: profileChart,
    genre: genreChart,
    artist: artistChart,
    album: albumChart,
    song: songChart,
  }[scope.kind];

  const chartData = scopedChart ?? [];

  return (
    <>
      {/* Public playlist pages (/$did/playlist/$rkey) hide the chart; library
          pages — including /library/playlist/$id — keep the overall Scrobble
          Stats like the rest of the library. */}
      {(!pathname.includes("/playlist/") || pathname.startsWith("/library")) && (
        <>
          <div className="flex items-baseline justify-between w-[300px] mb-[10px]">
            <LabelMedium className="!text-[var(--color-text)]">
              Scrobble Stats
            </LabelMedium>
            <Link
              to="/analytics"
              className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
              style={{ textDecoration: "none" }}
            >
              View more
            </Link>
          </div>
          <AreaChart
            width={300}
            height={120}
            data={chartData}
            className="top-[5px] right-[0px] left-[0px] bottom-[5px]"
          >
            <XAxis
              dataKey="date"
              axisLine={{ stroke: "#ccc", strokeWidth: 1 }}
              tick={{ fontSize: 10, color: "var(--color-text-muted)" }}
              tickFormatter={formatXAxis}
            />
            <Tooltip
              content={<CustomTooltip />}
              labelFormatter={(label) => dayjs(label).format("YYYY-MM-DD")}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#710de4"
              fill="#9754e463"
            />
          </AreaChart>
        </>
      )}
    </>
  );
}

export default ScrobblesAreaChart;
