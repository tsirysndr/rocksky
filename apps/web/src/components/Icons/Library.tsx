import type { FC } from "react";

export type LibraryProps = {
  size?: number;
  color?: string;
} & React.SVGProps<SVGSVGElement>;

// Same "your collection" shelf as the web-mobile bottom nav and the native app.
const Library: FC<LibraryProps> = ({
  size = 24,
  color = "currentColor",
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    {...props}
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill={color}
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 21.5V2.5h2v19H3Zm5 0V2.5h2v19H8Zm4.47-18.21 1.88-.68 6.92 18.8-1.88.69-6.92-18.81Z"
    />
  </svg>
);

export default Library;
