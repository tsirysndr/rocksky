import { useParams, useRouter } from "@tanstack/react-router";
import { LabelMedium } from "baseui/typography";
import numeral from "numeral";
import {
  useGlobalStatsQuery,
  useProfileStatsByDidQuery,
} from "../../hooks/useProfile";

const PROFILE_PATH = /^\/profile\//;

const SCOPE_OWNED_BY_PAGE = [
  "/song/",
  "/scrobble/",
  "/album/",
  "/artist/",
  "/playlist/",
];

function useScopedScrobbleCount(pathname: string, did?: string) {
  const isProfile = PROFILE_PATH.test(pathname) && !!did;

  const profileQuery = useProfileStatsByDidQuery(isProfile ? did : "");
  const globalQuery = useGlobalStatsQuery();

  if (isProfile) {
    return {
      label: "Scrobbles",
      count: profileQuery.data?.scrobbles as number | undefined,
      isLoading: profileQuery.isLoading,
    };
  }

  return {
    label: "Scrobbles on Rocksky",
    count: globalQuery.data?.scrobbles,
    isLoading: globalQuery.isLoading,
  };
}

function TotalScrobbles() {
  const {
    state: {
      location: { pathname },
    },
  } = useRouter();
  const { did } = useParams({ strict: false });

  const hidden = SCOPE_OWNED_BY_PAGE.some((p) => pathname.includes(p));

  const { label, count, isLoading } = useScopedScrobbleCount(pathname, did);

  if (hidden) return null;
  if (isLoading && count === undefined) return null;
  if (count === undefined) return null;

  return (
    <div className="mb-[30px]">
      <b className="!text-[var(--color-text-muted)] text-[11px] tracking-wide">
        {label.toUpperCase()}
      </b>
      <LabelMedium
        marginTop="4px"
        className="!text-[var(--color-text)] !text-[22px] !font-bold"
      >
        {numeral(count).format("0,0")}
      </LabelMedium>
    </div>
  );
}

export default TotalScrobbles;
