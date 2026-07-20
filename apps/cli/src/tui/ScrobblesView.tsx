import { useInfiniteQuery } from "@tanstack/react-query";
import { RockskyClient } from "client";
import dayjs from "dayjs";
import relative from "dayjs/plugin/relativeTime.js";
import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";
import { Cell, Ell } from "./Columns";
import { List } from "./List";
import { rockskyLink } from "./links";
import { BLUE, TEAL, VIOLET } from "./theme";

dayjs.extend(relative);

const PAGE_SIZE = 100;

interface Scrobble {
  id?: string;
  cover?: string;
  user?: string;
  title?: string;
  artist?: string;
  date?: string;
  uri?: string;
  albumUri?: string;
  artistUri?: string;
  listeners?: number;
  sha256?: string;
}

export function ScrobblesView({
  isActive,
  height = 15,
}: {
  isActive: boolean;
  height?: number;
}) {
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState<Scrobble | null>(null);

  const {
    data,
    isLoading: loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<Scrobble[]>({
    queryKey: ["globalScrobbles"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      new RockskyClient().getGlobalScrobbles({
        skip: pageParam as number,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE
        ? undefined
        : allPages.reduce((n, p) => n + p.length, 0),
    // Live feed — refresh in the background every 15s.
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const items: Scrobble[] = data ? data.pages.flat() : [];

  // Infinite scroll: load the next page as the cursor nears the end.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && selected >= items.length - 15) {
      fetchNextPage();
    }
  }, [selected, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useInput(
    (input, key) => {
      if (detail) {
        if (key.escape || key.backspace || key.delete || key.leftArrow)
          setDetail(null);
        return;
      }
      if (key.upArrow || input === "k") setSelected((s) => Math.max(0, s - 1));
      else if (key.downArrow || input === "j")
        setSelected((s) => Math.min(items.length - 1, s + 1));
      else if (key.return) setDetail(items[selected] ?? null);
    },
    { isActive },
  );

  if (loading) return <Text color={VIOLET}>Loading global scrobbles…</Text>;
  if (error) return <Text color="red">Error: {(error as Error).message}</Text>;
  if (detail) return <ScrobbleDetail scrobble={detail} />;

  return (
    <Box flexDirection="column">
      <List
      items={items}
      selected={selected}
      height={height}
      emptyText="No recent scrobbles."
      renderItem={(s, _idx, active) => {
        const when = s.date ? dayjs(s.date).fromNow() : "";
        return (
          <>
            <Cell width={2}>
              <Text color={BLUE}>{active ? "›" : " "}</Text>
            </Cell>
            <Cell width={18}>
              <Ell color={active ? BLUE : VIOLET} bold>{`@${s.user}`}</Ell>
            </Cell>
            <Cell grow>
              <Ell bold>{s.title}</Ell>
            </Cell>
            <Cell width={24}>
              <Ell dimColor>{s.artist}</Ell>
            </Cell>
            <Cell width={14} right>
              <Ell color={TEAL}>{when}</Ell>
            </Cell>
          </>
        );
      }}
      />
      {isFetchingNextPage ? <Text dimColor>Loading more…</Text> : null}
    </Box>
  );
}

function ScrobbleDetail({ scrobble }: { scrobble: Scrobble }) {
  const when = scrobble.date
    ? `${dayjs(scrobble.date).format("YYYY-MM-DD HH:mm")} (${dayjs(scrobble.date).fromNow()})`
    : "—";

  const fields: [string, string][] = [
    ["Artist", scrobble.artist || "—"],
    ["Scrobbled by", scrobble.user ? `@${scrobble.user}` : "—"],
    ["When", when],
    ["Listeners", String(scrobble.listeners ?? "—")],
    ["Track", rockskyLink(scrobble.uri) || "—"],
    ["Album", rockskyLink(scrobble.albumUri) || "—"],
    ["Artist page", rockskyLink(scrobble.artistUri) || "—"],
    ["SHA-256", scrobble.sha256 || "—"],
  ];

  return (
    <Box flexDirection="column">
      <Text dimColor>‹ Esc / Backspace to go back</Text>
      <Box marginTop={1}>
        <Text bold color={VIOLET}>
          {scrobble.title || "Unknown track"}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {fields.map(([label, value]) => (
          <Text key={label}>
            <Text color={BLUE}>{label.padEnd(14)}</Text>
            <Text>{value}</Text>
          </Text>
        ))}
      </Box>
      {scrobble.cover ? (
        <Box marginTop={1}>
          <Text color={TEAL}>{scrobble.cover}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
