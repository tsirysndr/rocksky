import type { Preview } from "@storybook/react";
import "../src/styles.css";
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "Rocksky",
      values: [{ name: "Rocksky", value: "#130825" }],
    },
    viewport: {
      viewports: {
        television: {
          name: "TV · 1920 × 1080",
          styles: { width: "1920px", height: "1080px" },
          type: "desktop",
        },
        hd: {
          name: "TV · 1280 × 720",
          styles: { width: "1280px", height: "720px" },
          type: "desktop",
        },
        ultrawide: {
          name: "Ultrawide · 2560 × 1080",
          styles: { width: "2560px", height: "1080px" },
          type: "desktop",
        },
      },
    },
    controls: { expanded: true },
  },
};
export default preview;
