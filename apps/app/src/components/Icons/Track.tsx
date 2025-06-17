import React, { FC } from "react";
import Svg, { Path } from "react-native-svg";

export type TrackProps = {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
};

const TrackIcon: FC<TrackProps> = ({ size = 24, color = "#fff", ...props }) => (
  <Svg
    viewBox={`0 0 ${size} ${size}`}
    width={props.width || size}
    height={props.height || size}
    {...props}
  >
    <Path
      d="M8.1 4.65v11.26a3.45 3.45 0 1 0 1.5 2.84V5.85l10.2-2.36v10.62A3.45 3.45 0 1 0 21.3 17V1.61Zm-2 16a2 2 0 1 1 2-2 2 2 0 0 1-1.95 2.05Zm11.7-1.8a1.95 1.95 0 1 1 2-1.85 2 2 0 0 1-1.95 1.9Z"
      fill={color}
    />
  </Svg>
);

export default TrackIcon;
