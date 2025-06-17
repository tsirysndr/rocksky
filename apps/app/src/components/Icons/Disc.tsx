import React, { FC } from "react";
import Svg, { Path } from "react-native-svg";

export type DiscProps = {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
};

const DiscIcon: FC<DiscProps> = ({ size = 24, color = "#fff", ...props }) => (
  <Svg
    viewBox={`0 0 ${size} ${size}`}
    width={props.width || size}
    height={props.height || size}
    aria-hidden
    fill={color}
    color="initial"
    {...props}
  >
    <Path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
    <Path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 6a2 2 0 1 1 2-2 2 2 0 0 1-2 2z" />
  </Svg>
);

export default DiscIcon;
