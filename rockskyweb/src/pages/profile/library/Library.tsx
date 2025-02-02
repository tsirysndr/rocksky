import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingSmall } from "baseui/typography";
import { Key, useState } from "react";

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
        <Tab title="Scrobbles"></Tab>
        <Tab title="Artists"></Tab>
        <Tab title="Albums"></Tab>
        <Tab title="Tracks"></Tab>
      </Tabs>
    </>
  );
}

export default Library;
