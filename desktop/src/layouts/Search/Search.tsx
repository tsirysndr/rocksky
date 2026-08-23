import styled from "@emotion/styled";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { Input } from "baseui/input";
import { useSetAtom } from "jotai";
import {
  searchModalOpenAtom,
  searchModalScopeAtom,
} from "../../atoms/searchModal";

// "/" affordance shown at the trailing edge — press "/" anywhere to open the
// command palette (see components/KeyboardShortcuts).
const SlashHint = styled.kbd`
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1;
  color: var(--color-text-muted);
  padding: 3px 8px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
`;

// The presentational field ignores pointer events so the wrapper handles the
// click; it exists purely to render the familiar search-box look.
const Trigger = styled.div`
  cursor: pointer;

  & > div {
    pointer-events: none;
  }
`;

// The sidebar search field is a trigger: clicking or activating it opens the
// Raycast-style command palette (see SearchModal) rather than searching inline.
function Search() {
  const openSearch = useSetAtom(searchModalOpenAtom);
  const setScope = useSetAtom(searchModalScopeAtom);
  const open = () => {
    setScope("all");
    openSearch(true);
  };

  return (
    <Trigger
      role="button"
      tabIndex={0}
      aria-label="Search"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <div>
        <Input
          readOnly
          startEnhancer={
            <SearchIcon size={20} color="var(--color-text-muted)" />
          }
          endEnhancer={<SlashHint>/</SlashHint>}
          placeholder="Search"
          overrides={{
            Root: {
              style: {
                backgroundColor: "var(--color-input-background)",
                borderColor: "var(--color-input-background)",
              },
            },
            StartEnhancer: {
              style: { backgroundColor: "var(--color-input-background)" },
            },
            EndEnhancer: {
              style: {
                backgroundColor: "var(--color-input-background)",
                paddingLeft: "0px",
              },
            },
            InputContainer: {
              style: { backgroundColor: "var(--color-input-background)" },
            },
            Input: {
              style: {
                color: "var(--color-text)",
                caretColor: "transparent",
              },
              props: { tabIndex: -1 },
            },
          }}
        />
      </div>
    </Trigger>
  );
}

export default Search;
