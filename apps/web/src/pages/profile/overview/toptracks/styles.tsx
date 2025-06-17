export default {
  pagination: {
    Root: {
      style: {
        justifyContent: "center",
        marginTop: "30px",
      },
    },
    DropdownContainer: {
      style: {
        backgroundColor: "var(--color-background)",
      },
    },
    Select: {
      props: {
        overrides: {
          Root: {
            style: {
              backgroundColor: "var(--color-background)",
              color: "var(--color-text)",
              ":hover": {
                backgroundColor: "var(--color-background)",
                color: "var(--color-text)",
              },
            },
          },
          ControlContainer: {
            style: {
              outline: "none",
              backgroundColor: "var(--color-background)",
              color: "var(--color-text) !important",
              ":hover": {
                backgroundColor: "var(--color-background)",
                color: "var(--color-text) !important",
              },
            },
          },
          SelectArrow: {
            props: {
              overrides: {
                Svg: {
                  style: { color: "var(--color-text)" },
                },
              },
            },
          },
          DropdownListItem: {
            style: {
              backgroundColor: "var(--color-background)",
              color: "var(--color-text)",
              ":hover": {
                backgroundColor: "var(--color-menu-hover)",
                color: "var(--color-text)",
              },
            },
          },
          SingleValue: {
            style: {
              color: "var(--color-text)",
            },
          },
          Dropdown: {
            style: {
              outline: "none",
              backgroundColor: "var(--color-background)",
            },
          },
          DropdownContainer: {
            style: {
              backgroundColor: "var(--color-background)",
              color: "var(--color-text)",
            },
          },
          Input: {
            style: {
              backgroundColor: "var(--color-background)",
              color: "var(--color-text)",
              ":hover": {
                backgroundColor: "var(--color-background) !important",
                color: "var(--color-text) !important",
              },
            },
          },
          InputContainer: {
            style: {
              backgroundColor: "var(--color-background)",
              ":hover": {
                backgroundColor: "var(--color-background)",
                color: "var(--color-text)",
              },
            },
          },
          Popover: {
            style: {
              backgroundColor: "var(--color-background)",
              color: "var(--color-text)",
            },
          },
          OptionContent: {
            style: {
              backgroundColor: "var(--color-background)",
              color: "var(--color-text)",
            },
          },
        },
      },
    },
    PrevButton: {
      style: {
        backgroundColor: "var(--color-background) !important",
        color: "var(--color-text) !important",
        ":hover": {
          backgroundColor: "var(--color-background) !important",
          color: "var(--color-text) !important",
        },
      },
    },
    NextButton: {
      style: {
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
        ":hover": {
          backgroundColor: "var(--color-background)",
          color: "var(--color-text) ",
        },
      },
    },
    MaxLabel: {
      style: {
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
      },
    },
  },
};
