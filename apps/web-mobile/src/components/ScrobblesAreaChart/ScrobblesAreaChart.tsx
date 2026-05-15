import dayjs from "dayjs";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Area, AreaChart, Tooltip, TooltipProps, XAxis } from "recharts";
import axios from "axios";
import { API_URL } from "../../consts";

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ backgroundColor: "var(--color-surface-2)", padding: "5px 10px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
        <span style={{ color: "var(--color-text-muted)" }}>{dayjs(label).format("dddd DD MMMM YYYY")}: </span>
        <span style={{ color: "var(--color-text)" }}>{numeral(payload[0].value).format("0,0")}</span>
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

    const fetchChart = async (url: string) => {
      try {
        const res = await axios.get(url);
        if (res.status === 200) setData(res.data);
      } catch {
        // ignore
      }
    };

    const base = `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart`;
    if (pathname.startsWith("/profile") && did) {
      fetchChart(`${base}?did=${did}`);
    } else if (pathname.includes("app.rocksky.artist") && did && rkey) {
      fetchChart(`${base}?artisturi=at://${did}/app.rocksky.artist/${rkey}`);
    } else if (pathname.includes("app.rocksky.album") && did && rkey) {
      fetchChart(`${base}?albumuri=at://${did}/app.rocksky.album/${rkey}`);
    } else if (pathname.includes("app.rocksky.song") && did && rkey) {
      fetchChart(`${base}?songuri=at://${did}/app.rocksky.song/${rkey}`);
    } else if (pathname.includes("app.rocksky.scrobble") && did && rkey) {
      fetchChart(`${base}?songuri=at://${did}/app.rocksky.scrobble/${rkey}`);
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
