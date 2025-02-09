import { HeadingSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useParams } from "react-router";
import { topAlbumsAtom } from "../../../../atoms/topAlbums";
import useLibrary from "../../../../hooks/useLibrary";

function TopAlbums() {
  const setTopAlbums = useSetAtom(topAlbumsAtom);
  const topAlbums = useAtomValue(topAlbumsAtom);
  const { did } = useParams<{ did: string }>();
  const { getAlbums } = useLibrary();

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopAlbums = async () => {
      const data = await getAlbums(did);
      setTopAlbums(data);
    };

    getTopAlbums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <HeadingSmall marginBottom={"15px"}>Top Albums</HeadingSmall>
      {topAlbums?.map((album, i) => (
        <div key={i}>{album.title}</div>
      ))}
    </>
  );
}

export default TopAlbums;
