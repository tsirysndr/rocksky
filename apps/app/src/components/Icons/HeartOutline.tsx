import React, { FC } from "react";
import Svg, { Path } from "react-native-svg";

export type HeartOutlineProps = {
  size?: number;
  color?: string;
};

const HeartOutline: FC<HeartOutlineProps> = ({ size = 20, color = "#000" }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M13.534 4C11.167 4 10 6.364 10 6.364S8.833 4 6.466 4C4.543 4 3.02 5.63 3 7.575c-.04 4.038 3.162 6.91 6.672 9.323a.578.578 0 0 0 .656 0c3.51-2.413 6.712-5.285 6.672-9.323C16.98 5.63 15.457 4 13.534 4Z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export default HeartOutline;
