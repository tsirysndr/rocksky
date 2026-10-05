import type {
  ArtistViewBasic,
  ChartsDecadeViewBasic,
  ChartsScrobblerViewBasic,
  ChartsView,
  SongViewBasic,
} from "@rocksky/sdk";
import { client } from ".";

export type AnalyticsRange = { from: string; to: string; label: string };
export type AnalyticsScope = { did?: string; range: AnalyticsRange };
const interval = ({ did, range }: AnalyticsScope) => ({
  did,
  startDate: `${range.from}T00:00:00.000Z`,
  endDate: `${range.to}T23:59:59.999Z`,
});
export async function getAnalyticsDaily(
  { did, range }: AnalyticsScope,
  signal?: AbortSignal,
) {
  const { data } = await client.get<ChartsView>(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    { params: { did, from: range.from, to: range.to }, signal },
  );
  return data.scrobbles ?? [];
}
export async function getAnalyticsArtists(
  scope: AnalyticsScope,
  signal?: AbortSignal,
) {
  const { data } = await client.get<{ artists?: ArtistViewBasic[] }>(
    "/xrpc/app.rocksky.charts.getTopArtists",
    { params: { ...interval(scope), limit: 10, offset: 0 }, signal },
  );
  return data.artists ?? [];
}
export async function getAnalyticsTracks(
  scope: AnalyticsScope,
  signal?: AbortSignal,
) {
  const { data } = await client.get<{ tracks?: SongViewBasic[] }>(
    "/xrpc/app.rocksky.charts.getTopTracks",
    { params: { ...interval(scope), limit: 10, offset: 0 }, signal },
  );
  return data.tracks ?? [];
}
export async function getAnalyticsDecades(
  scope: AnalyticsScope,
  signal?: AbortSignal,
) {
  const { data } = await client.get<{ decades?: ChartsDecadeViewBasic[] }>(
    "/xrpc/app.rocksky.charts.getDecades",
    { params: interval(scope), signal },
  );
  return data.decades ?? [];
}
export async function getAnalyticsScrobblers(
  range: AnalyticsRange,
  signal?: AbortSignal,
) {
  const { data } = await client.get<{
    scrobblers?: ChartsScrobblerViewBasic[];
  }>("/xrpc/app.rocksky.charts.getTopScrobblers", {
    params: { ...interval({ range }), limit: 10, offset: 0 },
    signal,
  });
  return data.scrobblers ?? [];
}
