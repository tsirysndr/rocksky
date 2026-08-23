export const getModalStyles = (albumArt?: string) => ({
  modal: {
    Root: {
      style: {
        zIndex: 60,
      },
    },
    Dialog: {
      style: {
        backgroundColor: albumArt ? "transparent" : "#000",
        backgroundImage: albumArt
          ? `linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url(${albumArt})`
          : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
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
});

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
