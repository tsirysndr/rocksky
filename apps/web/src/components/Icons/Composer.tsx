import { FC } from "react";

export type ComposerProps = {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
};

const Composer: FC<ComposerProps> = ({
  size = 24,
  color = "#000",
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 0 ${size} ${size}`}
    fill={color}
    height={size}
    width={size}
    {...props}
  >
    <path d="M15.312 11.717C16.339 10.801 17 9.482 17 8c0-2.757-2.243-5-5-5S7 5.243 7 8c0 1.484.663 2.805 1.693 3.721A7.996 7.996 0 0 0 4 19v1a1 1 0 0 0 2 0v-1a6 6 0 0 1 9.449-4.91 6.024 6.024 0 0 1 1.586-1.307 8.022 8.022 0 0 0-1.723-1.066zM12 11c-1.654 0-3-1.346-3-3s1.346-3 3-3 3 1.346 3 3-1.346 3-3 3zm9.943.059a.703.703 0 0 0-.581-.145l-2.5.5a.7.7 0 0 0-.562.686v5.3h-.8c-.938 0-1.7.763-1.7 1.7v.5c0 .938.763 1.7 1.7 1.7h.5c.938 0 1.7-.763 1.7-1.7v-4.926l1.938-.388a.7.7 0 0 0 .562-.687v-2a.698.698 0 0 0-.257-.54zM18.3 19.601a.3.3 0 0 1-.3.3h-.5a.3.3 0 0 1-.3-.3v-.5a.3.3 0 0 1 .3-.3h.8v.8zm2.5-6.575l-1.1.221v-.573l1.1-.22v.572z"></path>
  </svg>
);

export default Composer;
