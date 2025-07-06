import { useParams, useRouter } from "@tanstack/react-router";
import { LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { Area, AreaChart, Tooltip, TooltipProps, XAxis } from "recharts";
import useChart from "../../hooks/useChart";

const CustomTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#fff] border-[1px] border-[#ccc] p-[5px]">
        <span className="text-[#808080]">
          {dayjs(label).format("dddd DD MMMM YYYY")}:
        </span>
        <span className="text-[#710de4]">
          {" "}
          {numeral(payload[0].value).format("0,0")}
        </span>
      </div>
    );
  }

  return null;
};
const formatXAxis = (tickItem: string) => dayjs(tickItem).format("MMM D");

function ScrobblesAreaChart() {
  const {
    getScrobblesChart,
    getAlbumChart,
    getArtistChart,
    getSongChart,
    getProfileChart,
  } = useChart();
  const {
    state: {
      location: { pathname },
    },
  } = useRouter();
  const { did, rkey } = useParams({ strict: false });
  const [data, setData] = useState<
    {
      date: string;
      count: number;
    }[]
  >([]);

  useEffect(() => {
    const fetchScrobblesChart = async () => {
      if (pathname === "/") {
        return;
      }

      if (pathname.startsWith("/profile")) {
        const charts = await getProfileChart(did!);
        setData(charts);
        return;
      }

      if (pathname.includes("app.rocksky.artist")) {
        const charts = await getArtistChart(
          `at://${did}/app.rocksky.artist/${rkey}`
        );
        setData(charts);
        return;
      }

      if (pathname.includes("app.rocksky.album")) {
        const charts = await getAlbumChart(
          `at://${did}/app.rocksky.album/${rkey}`
        );
        setData(charts);
        return;
      }

      if (pathname.includes("app.rocksky.song")) {
        const charts = await getSongChart(
          `at://${did}/app.rocksky.song/${rkey}`
        );
        setData(charts);
        return;
      }

      if (pathname.includes("app.rocksky.scrobble")) {
        const charts = await getSongChart(
          `at://${did}/app.rocksky.scrobble/${rkey}`
        );
        setData(charts);
        return;
      }
    };
    fetchScrobblesChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {!pathname.includes("app.rocksky.playlist") && (
        <>
          <LabelMedium
            marginBottom={"20px"}
            className="!text-[var(--color-text)]"
          >
            Scrobble Stats
          </LabelMedium>
          <AreaChart
            width={300}
            height={120}
            data={
              pathname === "/" ||
              pathname.startsWith("/dropbox") ||
              pathname.startsWith("/googledrive")
                ? getScrobblesChart()
                : data
            }
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
