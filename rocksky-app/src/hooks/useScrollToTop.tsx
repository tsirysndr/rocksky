import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { FlatList } from "react-native-reanimated/lib/typescript/Animated";

export default function useScrollToTop() {
  const listRef = useRef<FlatList<any>>(null);
  const lastOffsetY = useRef(0);
  const scrollingDown = useRef(false);
  const [isVisible, setIsVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const updateButtonVisibility = (shouldShow: boolean) => {
    if (shouldShow !== isVisible) {
      setIsVisible(shouldShow);
    }
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isVisible, fadeAnim]);

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    scrollingDown.current = offsetY > lastOffsetY.current;
    lastOffsetY.current = offsetY;

    const shouldShowButton = scrollingDown.current && offsetY > 300;

    requestAnimationFrame(() => {
      updateButtonVisibility(shouldShowButton);
    });
  };

  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  return {
    listRef,
    fadeAnim,
    handleScroll,
    scrollToTop,
    isVisible,
  };
}
