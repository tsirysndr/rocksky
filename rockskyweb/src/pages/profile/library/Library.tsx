import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingSmall } from "baseui/typography";
import { Key, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import RecentTracks from "../overview/recenttracks";
import TopArtists from "../overview/topartists";
import TopTracks from "../overview/toptracks";
import Albums from "./albums";

function Library() {
  const [activeKey, setActiveKey] = useState<Key>("0");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");

    if (!tab) {
      return;
    }

    setActiveKey(tab);
  }, [searchParams]);

  return (
    <>
      <HeadingSmall>Library</HeadingSmall>
      <Tabs
        activeKey={activeKey}
        onChange={({ activeKey }) => {
          setActiveKey(activeKey);
        }}
        activateOnFocus
      >
        <Tab title="Scrobbles">
          <RecentTracks showTitle={false} size={50} showPagination />
        </Tab>
        <Tab title="Artists">
          <TopArtists showTitle={false} size={50} showPagination />
        </Tab>
        <Tab title="Albums">
          <Albums size={50} />
        </Tab>
        <Tab title="Tracks">
          <TopTracks showTitle={false} size={50} showPagination />
        </Tab>
      </Tabs>
    </>
  );
}

export default Library;
