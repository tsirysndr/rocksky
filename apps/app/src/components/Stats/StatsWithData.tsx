import { didAtom } from "@/src/atoms/did";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { useAtomValue } from "jotai";
import Stats from "./Stats";

const StatsWithData = () => {
  const did = useAtomValue(didAtom);
  const { data, isLoading } = useProfileStatsByDidQuery(did!);
  return (
    <>
      {!isLoading && data && (
        <Stats
          scrobbles={data.scrobbles}
          artists={data?.artists}
          lovedTracks={data?.lovedTracks}
        />
      )}
    </>
  );
};

export default StatsWithData;
