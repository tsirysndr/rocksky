export default {
  modal: {
    Root: {
      style: {
        zIndex: 60,
      },
    },
    Dialog: {
      style: {
        backgroundColor: "#000",
      },
    },
    Close: {
      style: {
        color: "#fff",
      },
    },
  },
  progressbar: {
    BarContainer: {
      style: {
        marginLeft: 0,
        marginRight: 0,
      },
    },
    BarProgress: {
      style: () => ({
        backgroundColor: "rgba(255, 255, 255, 0.2)",
      }),
    },
    Bar: {
      style: () => ({
        backgroundColor: "rgba(177, 178, 181, 0.218)",
      }),
    },
  },
};
