import type { FC } from "react";
import Svg, { Path } from "react-native-svg";

export type LibraryProps = {
  size?: number;
  color?: string;
};

// "Your collection" shelf: two upright spines and one leaning against them,
// in the spirit of the Spotify library / Tidal collections icons.
const Library: FC<LibraryProps> = ({ size = 24, color = "#000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      fill={color}
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 21.5V2.5h2v19H3Zm5 0V2.5h2v19H8Zm4.47-18.21 1.88-.68 6.92 18.8-1.88.69-6.92-18.81Z"
    />
  </Svg>
);

export default Library;
