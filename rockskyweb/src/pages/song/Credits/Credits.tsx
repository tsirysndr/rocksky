import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
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
          <HeadingXSmall marginBottom={"20px"}>Credits</HeadingXSmall>
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
                <div
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                    height: "48px",
                    borderRadius: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 25px", // Add padding to prevent text from touching the edges
                  }}
                >
                  <Composer />
                  <div
                    style={{
                      marginLeft: "10px",
                      width: "100%", // Ensure the container takes full width
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap", // Prevent wrapping
                    }}
                  >
                    <LabelMedium
                      marginTop={"0px"}
                      marginBottom={"0px"}
                      style={{
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        overflow: "hidden", // Ensure the LabelMedium also applies ellipsis
                      }}
                    >
                      {composer}
                    </LabelMedium>
                    <div
                      style={{
                        fontSize: "11px",
                      }}
                    >
                      Composer
                    </div>
                  </div>
                </div>
              </FlexGridItem>
            ))}
          </FlexGrid>
        </>
      )}
    </div>
  );
}

export default Credits;
