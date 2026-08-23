import dayjs from "dayjs";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Area, AreaChart, Tooltip, TooltipProps, XAxis } from "recharts";
import { rocksky } from "../../lib/rocksky";

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ backgroundColor: "var(--color-surface-2)", padding: "5px 10px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
        <span style={{ color: "var(--color-text-muted)" }}><span style={{ fontFamily: "var(--font-mono)" }}>{dayjs(label).format("dddd DD MMMM YYYY")}</span>: </span>
        <span style={{ color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>{numeral(payload[0].value).format("0,0")}</span>
      </div>
    );
  }
  return null;
};

const formatXAxis = (tickItem: string) => dayjs(tickItem).format("MMM D");

function ScrobblesAreaChart() {
  const { pathname } = useLocation();
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const [data, setData] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    if (pathname === "/") return;

    const fetchChart = async (opts: {
      did?: string;
      artisturi?: string;
      albumuri?: string;
      songuri?: string;
    }) => {
      try {
        const res = await rocksky().scrobblesChart(opts);
        setData(res as unknown as { date: string; count: number }[]);
      } catch {
        // ignore
      }
    };

    if (pathname.startsWith("/profile") && did) {
      fetchChart({ did });
    } else if (pathname.includes("app.rocksky.artist") && did && rkey) {
      fetchChart({ artisturi: `at://${did}/app.rocksky.artist/${rkey}` });
    } else if (pathname.includes("app.rocksky.album") && did && rkey) {
      fetchChart({ albumuri: `at://${did}/app.rocksky.album/${rkey}` });
    } else if (pathname.includes("app.rocksky.song") && did && rkey) {
      fetchChart({ songuri: `at://${did}/app.rocksky.song/${rkey}` });
    } else if (pathname.includes("app.rocksky.scrobble") && did && rkey) {
      fetchChart({ songuri: `at://${did}/app.rocksky.scrobble/${rkey}` });
    }
  }, [pathname, did, rkey]);

  if (!data.length) return null;

  return (
    <AreaChart width={320} height={100} data={data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
      <XAxis dataKey="date" axisLine={{ stroke: "var(--color-border)" }} tick={{ fontSize: 9, fill: "var(--color-text-muted)" }} tickFormatter={formatXAxis} />
      <Tooltip content={<CustomTooltip />} labelFormatter={(label) => dayjs(label).format("YYYY-MM-DD")} />
      <Area type="monotone" dataKey="count" stroke="#710de4" fill="#9754e463" />
    </AreaChart>
  );
}

export default ScrobblesAreaChart;
