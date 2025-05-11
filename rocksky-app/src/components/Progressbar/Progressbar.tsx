import { FC } from "react";
import { View } from "react-native";

export type ProgressbarProps = {
  progress: number;
  className?: string;
  color?: string;
};

const Progressbar: FC<ProgressbarProps> = (props) => {
  const color = props.color ? props.color : "#ff2876";
  return (
    <View
      className={`w-full h-[2px] bg-[rgba(109,109,156,0.3)] rounded-[10px] ${props.className}`}
    >
      <View
        className={`h-full rounded-[10px] transition-all duration-300 ease-in-out`}
        style={{ width: `${props.progress}%`, backgroundColor: color }}
      ></View>
    </View>
  );
};

export default Progressbar;
