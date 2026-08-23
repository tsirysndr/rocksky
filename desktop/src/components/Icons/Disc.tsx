import { FC } from "react";

export type TrackProps = {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
};

const Disc: FC<TrackProps> = ({ size = 24, color = "#000", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 0 ${size} ${size}`}
    {...props}
    aria-hidden="true"
    focusable="false"
    fill={color}
    color="initial"
  >
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
    <path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 6a2 2 0 1 1 2-2 2 2 0 0 1-2 2z"></path>
  </svg>
);

export default Disc;
