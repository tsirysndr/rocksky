import { Link, useParams } from "@tanstack/react-router";
import { useArtistsByGenreQuery } from "../../../hooks/useLibrary";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { BlockProps } from "baseui/block";
import numeral from "numeral";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

function Artists() {
  const { id: genre } = useParams({ strict: false });
  const { data, isLoading } = useArtistsByGenreQuery(genre!, 0, 20);
  return (
    <>
      {!isLoading && (
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale1000"
          className="mt-[50px]"
        >
          {data?.map((artist) => (
            <FlexGridItem {...itemProps} key={artist.id}>
              <div className="flex flex-col items-center">
                <Link
                  to={
                    `/${artist.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                  }
                  className="text-initial"
                >
                  <img
                    src={artist.picture}
                    alt={artist.name}
                    className="w-[200px] h-[200px] rounded-full mb-[20px]"
                    key={artist.id}
                  />
                </Link>
                <Link
                  to={
                    `/${artist.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                  }
                  className="!text-[var(--color-text)] no-underline"
                >
                  <b>{artist.name}</b>
                </Link>
                <span className="!text-[var(--color-text-muted)] text-[14px]">
                  {numeral(artist.playCount).format("0,0")} plays
                </span>
              </div>
            </FlexGridItem>
          ))}
        </FlexGrid>
      )}
    </>
  );
}

export default Artists;
