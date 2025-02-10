import { useEffect } from "react";
import { useParams } from "react-router";
import useLibrary from "../../hooks/useLibrary";
import Main from "../../layouts/Main";

const Artist = () => {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { getArtist } = useLibrary();

  useEffect(() => {
    if (!did || !rkey) {
      return;
    }
    getArtist(did, rkey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, rkey]);

  return (
    <Main>
      <div style={{ paddingBottom: 100, paddingTop: 50 }}></div>
    </Main>
  );
};

export default Artist;
