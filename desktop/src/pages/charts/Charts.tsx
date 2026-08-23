import { HeadingMedium } from "baseui/typography";
import Main from "../../layouts/Main";
import { Tab } from "baseui/tabs-motion/tab";
import { Tabs } from "baseui/tabs-motion";
import React, { useState } from "react";
import Realtime from "./realtime";
import Weekly from "./weekly";

function Charts() {
  const [activeKey, setActiveKey] = useState<React.Key>("0");
  return (
    <Main>
      <div className="mt-[60px] mb-[100px]">
        <HeadingMedium
          marginTop="0px"
          marginBottom={"35px"}
          className="!text-[var(--color-text)]"
        >
          Charts
        </HeadingMedium>

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
            title="Real time"
            overrides={{
              Tab: {
                style: {
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-background) !important",
                },
              },
            }}
          >
            <Realtime />
          </Tab>
          <Tab
            title="Weekly"
            overrides={{
              Tab: {
                style: {
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-background) !important",
                },
              },
            }}
          >
            <Weekly />
          </Tab>
        </Tabs>
      </div>
    </Main>
  );
}

export default Charts;
