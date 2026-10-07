import {
  Fragment,
  isValidElement,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Animated, SectionList, View, type FlatListProps } from "react-native";
import { colors } from "../../theme";

type Props<T> = Pick<
  FlatListProps<T>,
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
  const rows: Row[] = [];
  for (let index = 0; index < (data?.length ?? 0); index += numColumns) {
    const items = Array.from(
      { length: Math.min(numColumns, data!.length - index) },
      (_, column) => ({ item: data![index + column], index: index + column }),
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
          { useNativeDriver: false },
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
              {Array.from({ length: numColumns - cells.length }, (_, index) => (
                <View
                  key={`spacer:${index}`}
                  style={{ flex: 1 / numColumns }}
                />
              ))}
            </View>
          );
        }}
      />
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
