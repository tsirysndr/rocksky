import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import Stats from "./Stats";

const StatsWithData = () => {
  const { data, isLoading } = useProfileStatsByDidQuery(
    "did:plc:7vdlgi2bflelz7mmuxoqjfcr"
  );
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
