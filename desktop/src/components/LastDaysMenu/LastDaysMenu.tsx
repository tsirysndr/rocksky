import { NestedMenus, StatefulMenu } from "baseui/menu";
import { StatefulPopover } from "baseui/popover";
import {
  ALL_TIME,
  LAST_180_DAYS,
  LAST_30_DAYS,
  LAST_365_DAYS,
  LAST_7_DAYS,
  LAST_90_DAYS,
} from "../../consts";

export interface LastDaysMenuProps {
  children: React.ReactNode;
  onSelect: (id: string) => void;
}

function LastDaysMenu(props: LastDaysMenuProps) {
  return (
    <StatefulPopover
      autoFocus={false}
      placement="bottomRight"
      content={({ close }) => (
        <div className="border-[var(--color-border)] w-[200px] border-[1px] bg-[var(--color-background)] rounded-[6px]">
          <NestedMenus>
            <StatefulMenu
              items={[
                {
                  id: LAST_7_DAYS,
                  label: "Last 7 days",
                },
                {
                  id: LAST_30_DAYS,
                  label: "Last 30 days",
                },
                {
                  id: LAST_90_DAYS,
                  label: "Last 90 days",
                },
                {
                  id: LAST_180_DAYS,
                  label: "Last 180 days",
                },
                {
                  id: LAST_365_DAYS,
                  label: "Last 365 days",
                },
                {
                  id: ALL_TIME,
                  label: "All time",
                },
              ]}
              onItemSelect={({ item }) => {
                props.onSelect(item.id);
                close();
              }}
              overrides={{
                List: {
                  style: {
                    boxShadow: "none",
                    outline: "none !important",
                    backgroundColor: "var(--color-background)",
                  },
                },
                ListItem: {
                  style: {
                    backgroundColor: "var(--color-background)",
                    color: "var(--color-text)",
                    ":hover": {
                      backgroundColor: "var(--color-menu-hover)",
                    },
                  },
                },
                Option: {
                  props: {
                    getChildMenu: (item: { label: string }) => {
                      if (item.label === "Add to Playlist") {
                        return (
                          <div className="border-[var(--color-border)] w-[205px] border-[1px] bg-[var(--color-background)] rounded-[6px]">
                            <StatefulMenu
                              items={{
                                __ungrouped: [
                                  {
                                    label: "Create new playlist",
                                  },
                                ],
                              }}
                              overrides={{
                                List: {
                                  style: {
                                    boxShadow: "none",
                                    outline: "none !important",
                                    backgroundColor: "var(--color-background)",
                                  },
                                },
                                ListItem: {
                                  style: {
                                    backgroundColor: "var(--color-background)",
                                    color: "var(--color-text)",
                                    ":hover": {
                                      backgroundColor:
                                        "var(--color-menu-hover)",
                                    },
                                  },
                                },
                              }}
                            />
                          </div>
                        );
                      }
                      return null;
                    },
                  },
                },
              }}
            />
          </NestedMenus>
        </div>
      )}
      overrides={{
        Arrow: {
          style: {
            backgroundColor: "var(--color-border)",
          },
        },
        Inner: {
          style: {
            backgroundColor: "var(--color-background)",
          },
        },
      }}
    >
      {props.children}
    </StatefulPopover>
  );
}

export default LastDaysMenu;
