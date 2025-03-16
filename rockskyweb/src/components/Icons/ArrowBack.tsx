import { FC } from "react";

export type ArrowBackProps = {
  color?: string;
  size?: number;
};

const ArrowBack: FC<ArrowBackProps> = ({
  color = "#000",
  size = 20,
  ...props
}) => (
  <svg
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    style={{
      WebkitPrintColorAdjust: "exact",
    }}
    fill="none"
    {...props}
  >
    <g
      style={{
        fill: color,
      }}
    >
      <path
        fill="none"
        d="M0 0h20v20H0Z"
        style={{
          fill: "none",
        }}
      />
      <path
        d="M16 9.25H6.873l4.192-4.193L10 4l-6 6 6 6 1.058-1.058-4.185-4.192H16v-1.5Z"
        style={{
          fill: color,
        }}
      />
    </g>
  </svg>
);

export default ArrowBack;
