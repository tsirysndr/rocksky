import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingXSmall, LabelMedium } from "baseui/typography";
import Composer from "../../../components/Icons/Composer";

export type CreditsProps = {
  composers: string[] | null;
};

function Credits({ composers }: CreditsProps) {
  return (
    <div>
      {!!composers && composers.length > 0 && (
        <>
          <HeadingXSmall
            marginBottom={"20px"}
            className="!text-[var(--color-text)]"
          >
            Credits
          </HeadingXSmall>
          <FlexGrid
            flexGridColumnCount={[1, 2, 3]}
            flexGridColumnGap="scale800"
            flexGridRowGap="scale800"
          >
            {composers.map((composer, index) => (
              <FlexGridItem
                key={index}
                style={{
                  overflow: "hidden",
                }}
              >
                <StatefulTooltip content={composer} returnFocus autoFocus>
                  <div
                    style={{
                      backgroundColor: "var(--color-default-button)",
                      height: "48px",
                      borderRadius: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 25px", // Add padding to prevent text from touching the edges
                    }}
                  >
                    <Composer color="var(--color-text)" />
                    <div className="ml-[10px] w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      <LabelMedium
                        marginTop={"0px"}
                        marginBottom={"0px"}
                        className="!text-[var(--color-text)] text-ellipsis whitespace-nowrap overflow-hidden"
                      >
                        {composer}
                      </LabelMedium>
                      <div className="text-[11px]">Composer</div>
                    </div>
                  </div>
                </StatefulTooltip>
              </FlexGridItem>
            ))}
          </FlexGrid>
        </>
      )}
    </div>
  );
}

export default Credits;
