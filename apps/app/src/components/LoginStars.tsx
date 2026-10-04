import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

// A stable illustration: typing and opening the keyboard don't regenerate stars.
const stars = Array.from({ length: 64 }, (_, index) => ({
  id: index,
  x: (index * 137.5 + 17) % 400,
  y: (index * 83.7 + 29) % 800,
  radius: index % 5 === 0 ? 1.5 : 0.8,
}));

export default function LoginStars() {
  const pink = useId();
  const purple = useId();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient id={pink} cx="85%" cy="8%" r="60%">
            <Stop offset="0" stopColor="#ff2876" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#ff2876" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={purple} cx="10%" cy="95%" r="65%">
            <Stop offset="0" stopColor="#8d2dff" stopOpacity={0.2} />
            <Stop offset="1" stopColor="#8d2dff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={400} height={800} fill={`url(#${pink})`} />
        <Rect width={400} height={800} fill={`url(#${purple})`} />
        {stars.map((star) => (
          <Circle
            key={star.id}
            cx={star.x}
            cy={star.y}
            r={star.radius}
            fill={star.id % 4 === 0 ? "#ffc9dd" : "#f0e8f5"}
            opacity={star.y > 200 && star.y < 650 ? 0.12 : 0.45}
          />
        ))}
        {[
          { x: 64, y: 98 },
          { x: 323, y: 170 },
          { x: 51, y: 694 },
          { x: 310, y: 741 },
        ].map((star) => (
          <Path
            key={star.x}
            d={`M ${star.x} ${star.y - 8} Q ${star.x + 1} ${star.y - 1} ${star.x + 8} ${star.y} Q ${star.x + 1} ${star.y + 1} ${star.x} ${star.y + 8} Q ${star.x - 1} ${star.y + 1} ${star.x - 8} ${star.y} Q ${star.x - 1} ${star.y - 1} ${star.x} ${star.y - 8}`}
            fill="#ffc9dd"
            opacity={0.55}
          />
        ))}
      </Svg>
    </View>
  );
}
