import {
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { SectionList, View, type FlatListProps } from "react-native";
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
    <SectionList<Row>
      {...props}
      sections={[{ data: rows }]}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={<>{header}</>}
      stickySectionHeadersEnabled={!!tabs}
      removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled"
      renderSectionHeader={() =>
        tabs ? (
          <View style={{ backgroundColor: colors.background }}>{tabs}</View>
        ) : null
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
              <View key={`spacer:${index}`} style={{ flex: 1 / numColumns }} />
            ))}
          </View>
        );
      }}
    />
  );
}
