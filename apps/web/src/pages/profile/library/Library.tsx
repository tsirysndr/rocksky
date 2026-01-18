import { useSearch } from "@tanstack/react-router";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingSmall } from "baseui/typography";
import _ from "lodash";
import { Key, useEffect, useState } from "react";
import RecentTracks from "../overview/recenttracks";
import TopArtists from "../overview/topartists";
import TopTracks from "../overview/toptracks";
import Albums from "./albums";
import consola from "consola";

export type LibraryProps = {
  activeKey?: string;
};

function Library(props: LibraryProps) {
  const [activeKey, setActiveKey] = useState<Key>(
    _.get(props, "activeKey", "0"),
  );
  const { tab } = useSearch({ strict: false });
  consola.info("tab", tab);

  useEffect(() => {
    if (!tab) {
      return;
    }

    setActiveKey(tab);
  }, [tab]);

  return (
    <>
      <HeadingSmall className="!text-[var(--color-text)]">Library</HeadingSmall>
      <Tabs
        activeKey={activeKey}
        onChange={({ activeKey }) => {
          setActiveKey(activeKey);
        }}
        overrides={{
          TabHighlight: {
            style: {
              backgroundColor: "var(--color-purple)",
            },
          },
          TabBorder: {
            style: {
              display: "none",
            },
          },
        }}
        activateOnFocus
      >
        <Tab
          title="Scrobbles"
          overrides={{
            Tab: {
              style: {
                color: "var(--color-text)",
                backgroundColor: "var(--color-background) !important",
              },
            },
          }}
        >
          <RecentTracks showTitle={false} size={50} showPagination />
        </Tab>
        <Tab
          title="Artists"
          overrides={{
            Tab: {
              style: {
                color: "var(--color-text)",
                backgroundColor: "var(--color-background) !important",
              },
            },
          }}
        >
          <TopArtists showTitle={false} size={50} showPagination />
        </Tab>
        <Tab
          title="Albums"
          overrides={{
            Tab: {
              style: {
                color: "var(--color-text)",
                backgroundColor: "var(--color-background) !important",
              },
            },
          }}
        >
          <Albums size={50} />
        </Tab>
        <Tab
          title="Tracks"
          overrides={{
            Tab: {
              style: {
                color: "var(--color-text)",
                backgroundColor: "var(--color-background) !important",
              },
            },
          }}
        >
          <TopTracks showTitle={false} size={50} showPagination />
        </Tab>
      </Tabs>
    </>
  );
}

export default Library;
