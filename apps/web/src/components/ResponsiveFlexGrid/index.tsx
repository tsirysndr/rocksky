import { FlexGrid, type FlexGridProps } from "baseui/flex-grid";
import { useAtomValue } from "jotai";
import { rightPaneHiddenAtom } from "../../atoms/rightPane";

/**
 * A FlexGrid whose widest breakpoint gains a column when the side panel is
 * hidden — the content column goes from 770px to 1090px, which is room for
 * a fourth card.
 */
function ResponsiveFlexGrid(props: FlexGridProps) {
  const paneHidden = useAtomValue(rightPaneHiddenAtom);

  return (
    <FlexGrid flexGridColumnCount={[1, 2, paneHidden ? 4 : 3]} {...props} />
  );
}

export default ResponsiveFlexGrid;
