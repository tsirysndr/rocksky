import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingSmall } from "baseui/typography";
import { Key, useState } from "react";
import RecentTracks from "../overview/recenttracks";
import TopArtists from "../overview/topartists";
import TopTracks from "../overview/toptracks";
import Albums from "./albums";

function Library() {
  const [activeKey, setActiveKey] = useState<Key>("0");
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
          <RecentTracks showTitle={false} size={100} />
        </Tab>
        <Tab title="Artists">
          <TopArtists showTitle={false} size={100} />
        </Tab>
        <Tab title="Albums">
          <Albums />
        </Tab>
        <Tab title="Tracks">
          <TopTracks showTitle={false} size={100} />
        </Tab>
      </Tabs>
    </>
  );
}

export default Library;
