import Feather from "@expo/vector-icons/Feather";
import {
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useRef,
  useState,
} from "react";
import {
  Animated,
  type FlatListProps,
  SectionList,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "../../theme";

type Props<T> = Pick<
  FlatListProps<T>,
  | "contentContainerStyle"
  | "data"
  | "renderItem"
  | "keyExtractor"
  | "numColumns"
  | "columnWrapperStyle"
  | "ListHeaderComponent"
  | "ListEmptyComponent"
  | "ListFooterComponent"
  | "initialNumToRender"
  | "maxToRenderPerBatch"
  | "windowSize"
  | "onEndReached"
  | "onMomentumScrollEnd"
  | "onEndReachedThreshold"
  | "showsVerticalScrollIndicator"
  | "refreshControl"
  | "alwaysBounceVertical"
  | "extraData"
> & {
  header?: ReactNode;
  tabs?: ReactNode;
};

function content(value: FlatListProps<unknown>["ListHeaderComponent"]) {
  if (!value) return null;
  if (isValidElement(value)) return value;
  const Component = value as React.ComponentType;
  return <Component />;
}

/** One virtualized scroll surface: the library header scrolls, only tabs stick. */
export default function LibraryList<T>({
  header,
  tabs,
  data,
  renderItem,
  keyExtractor,
  numColumns = 1,
  columnWrapperStyle,
  ListHeaderComponent,
  ListEmptyComponent,
  ...props
}: Props<T>) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  // Android/Fabric can draw a transformed sticky header at its new position
  // while nested tab presses still hit its old scroll-content bounds. Keep one
  // interactive copy outside the list and move its actual layout (top), not a
  // native transform. The section reserves its space so rows never jump.
  const controlsTop =
    headerHeight > 0
      ? scrollY.interpolate({
          inputRange: [0, headerHeight],
          outputRange: [headerHeight, 0],
          extrapolate: "clamp",
        })
      : 0;
  type Row = { key: string; items: { item: T; index: number }[] };
  const list = useRef<SectionList<Row>>(null);
  const rows: Row[] = [];
  const entries = data ?? [];
  for (let index = 0; index < entries.length; index += numColumns) {
    const items = Array.from(
      { length: Math.min(numColumns, entries.length - index) },
      (_, column) => ({ item: entries[index + column], index: index + column }),
    );
    rows.push({
      key: `row:${keyExtractor?.(items[0].item, index) ?? index}`,
      items,
    });
  }
  // Keep controls and empty states in the same scroll surface as the tracks.
  if (ListHeaderComponent) rows.unshift({ key: "controls", items: [] });
  if (!data?.length) rows.push({ key: "empty", items: [] });
  return (
    <View style={{ flex: 1 }}>
      <SectionList<Row>
        {...props}
        ref={list}
        sections={[{ data: rows }]}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={
          <View
            onLayout={(event) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
          >
            {header}
          </View>
        }
        stickySectionHeadersEnabled={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (event: {
              nativeEvent: { contentOffset: { y: number } };
            }) => setShowScrollTop(event.nativeEvent.contentOffset.y > 300),
          },
        )}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={() =>
          tabs ? <View style={{ height: controlsHeight }} /> : null
        }
        renderItem={({ item: row, separators }) => {
          if (row.key === "controls") return content(ListHeaderComponent);
          if (row.key === "empty") return content(ListEmptyComponent);
          const cells = row.items.map(({ item, index }) => (
            <Fragment key={keyExtractor?.(item, index) ?? index}>
              {renderItem?.({ item, index, separators })}
            </Fragment>
          ));
          if (numColumns === 1) return cells[0] as ReactElement;
          return (
            <View style={[{ flexDirection: "row" }, columnWrapperStyle]}>
              {cells}
              {cells.length < numColumns && (
                <View
                  style={{ flex: (numColumns - cells.length) / numColumns }}
                />
              )}
            </View>
          );
        }}
      />
      {showScrollTop && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
          onPress={() =>
            list.current
              ?.getScrollResponder()
              ?.scrollTo({ y: 0, animated: true })
          }
          style={{
            position: "absolute",
            right: 20,
            bottom: 24,
            zIndex: 30,
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.surface3,
            borderWidth: 1,
            borderColor: colors.border,
            elevation: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="arrow-up" size={23} color={colors.text} />
        </TouchableOpacity>
      )}
      {!!tabs && (
        <Animated.View
          collapsable={false}
          onLayout={(event) =>
            setControlsHeight(event.nativeEvent.layout.height)
          }
          style={{
            position: "absolute",
            top: controlsTop,
            left: 0,
            right: 0,
            zIndex: 20,
            backgroundColor: colors.background,
          }}
        >
          {tabs}
        </Animated.View>
      )}
    </View>
  );
}
