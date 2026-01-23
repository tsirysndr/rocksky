import { Link, useParams } from "@tanstack/react-router";
import { useAlbumsByGenreQuery } from "../../../hooks/useLibrary";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { BlockProps } from "baseui/block";
import numeral from "numeral";
import dayjs from "dayjs";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

function Albums() {
  const { id: genre } = useParams({ strict: false });
  const { data, isLoading } = useAlbumsByGenreQuery(genre!, 0, 20);
  return (
    <>
      {!isLoading && (
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale1000"
          className="mt-[50px]"
        >
          {data?.map((album) => (
            <FlexGridItem {...itemProps} key={album.id}>
              <div className="flex flex-col items-start">
                <Link
                  to={
                    `/${album.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                  }
                  className="text-initial"
                >
                  <img
                    src={album.albumArt}
                    alt={album.title}
                    className="w-[230px] h-[230px]  mb-[20px]"
                    key={album.id}
                  />
                </Link>
                <Link
                  to={
                    `/${album.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                  }
                  className="!text-[var(--color-text)] no-underline line-clamp-2 text-start max-w-[230px]"
                >
                  <b>{album.title}</b>
                </Link>
                <Link
                  to={
                    `/${album.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                  }
                  className="!text-[var(--color-text)] no-underline"
                >
                  <span className="text-[14px] line-clamp-2 text-start max-w-[230px]">
                    {album.artist}
                  </span>
                </Link>
                <span className="!text-[var(--color-text-muted)] text-[14px] mt-[5px]">
                  {numeral(album.playCount).format("0,0")} plays
                </span>
                <span className="!text-[var(--color-text-muted)] text-[14px]">
                  {album.releaseDate
                    ? dayjs(album.releaseDate).format("MMMM D, YYYY")
                    : album.year}
                </span>
              </div>
            </FlexGridItem>
          ))}
        </FlexGrid>
      )}
    </>
  );
}

export default Albums;
