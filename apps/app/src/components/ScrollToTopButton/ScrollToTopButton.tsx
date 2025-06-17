import { FontAwesome5 } from "@expo/vector-icons";
import { FC } from "react";
import { Animated, Pressable } from "react-native";

export type ScrollToTopButtonProps = {
  bottom: number;
  fadeAnim: Animated.Value;
  onPress: () => void;
};

const ScrollToTopButton: FC<ScrollToTopButtonProps> = ({
  bottom,
  fadeAnim,
  onPress,
}) => (
  <Animated.View
    style={{
      position: "absolute",
      bottom,
      left: 20,
      opacity: fadeAnim,
      zIndex: 1000,
    }}
  >
    <Pressable
      onPress={onPress}
      style={{
        borderColor: "#333",
        borderWidth: 1,
        borderStyle: "solid",
        backgroundColor: "#000",
        borderRadius: 30,
        width: 60,
        height: 60,
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
      }}
    >
      <FontAwesome5 name="chevron-up" size={20} color="white" />
    </Pressable>
  </Animated.View>
);

export default ScrollToTopButton;
