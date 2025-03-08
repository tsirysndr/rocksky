import { LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router";
import { Area, AreaChart, Tooltip, TooltipProps, XAxis } from "recharts";
import useChart from "../../hooks/useChart";

const CustomTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: "white",
          padding: "5px",
          border: "1px solid #ccc",
        }}
      >
        <span style={{ color: "#808080" }}>
          {dayjs(label).format("dddd DD MMMM YYYY")}:
        </span>
        <span> {numeral(payload[0].value).format("0,0")}</span>
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
  const { pathname } = useLocation();
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
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
      <LabelMedium marginBottom={"20px"}>Scrobble Stats</LabelMedium>
      <AreaChart
        width={300}
        height={120}
        data={pathname === "/" ? getScrobblesChart() : data}
        margin={{
          top: 5,
          right: 0,
          left: 0,
          bottom: 5,
        }}
      >
        <XAxis
          dataKey="date"
          axisLine={{ stroke: "#ccc", strokeWidth: 1 }}
          tick={{ fontSize: 10 }}
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
  );
}

export default ScrobblesAreaChart;
