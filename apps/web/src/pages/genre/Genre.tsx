import { HeadingMedium } from "baseui/typography";
import Main from "../../layouts/Main";
import { Tab, Tabs } from "baseui/tabs-motion";
import React, { useState } from "react";
import Artists from "./artists";
import Albums from "./albums";
import Tracks from "./tracks";
import _ from "lodash";
import { useParams } from "@tanstack/react-router";

export default function Genre() {
  const { id: genre } = useParams({ strict: false });
  const [activeKey, setActiveKey] = useState<React.Key>("0");
  return (
    <Main>
      <div className="mt-[60px]">
        <HeadingMedium
          marginTop="0px"
          marginBottom={"35px"}
          className="!text-[var(--color-text)]"
        >
          {_.upperFirst(genre)} music
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
            <Artists />
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
            <Albums />
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
            <Tracks />
          </Tab>
        </Tabs>
      </div>
    </Main>
  );
}
