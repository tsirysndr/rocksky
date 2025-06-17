import { FC } from "react";

export type ArtistProps = {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
};

const Artist: FC<ArtistProps> = ({ size = 24, color = "#000", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 0 ${size} ${size}`}
    {...props}
  >
    <path
      d="M20 4.22a5.67 5.67 0 0 0-9.68 4.57l-8 9.79 3.3 3.3 9.79-8c.18 0 .36.05.55.05a5.7 5.7 0 0 0 4-9.73ZM5.74 19.86l-1.38-1.38 6.44-7.89a5.48 5.48 0 0 0 2.83 2.84Zm13.21-8.65a4.2 4.2 0 1 1 0-5.94 4.17 4.17 0 0 1 0 5.95Z"
      fill={color}
    />
  </svg>
);

export default Artist;
