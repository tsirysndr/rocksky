import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        "rockford-light": ["RockfordSansLight"],
        "rockford-regular": ["RockfordSansRegular"],
        "rockford-bold": ["RockfordSansBold"],
        "rockford-regular-italic": ["RockfordSansRegularItalic"],
        "rockford-medium": ["RockfordSansMedium"],
        "rockford-bold-italic": ["RockfordSansBoldItalic"],
        "rockford-extra-bold": ["RockfordSansExtraBold"],
      },
    },
  },
  plugins: [],
} satisfies Config;
