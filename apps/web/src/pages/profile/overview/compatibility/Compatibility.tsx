import { useParams } from "@tanstack/react-router";
import {
  useActorCompatibilityQuery,
  useProfileByDidQuery,
} from "../../../../hooks/useProfile";
import { Avatar } from "baseui/avatar";
import { Link } from "@tanstack/react-router";

function Compatibility() {
  const { did } = useParams({ strict: false });
  const profile = useProfileByDidQuery(did!);
  const currentUser = useProfileByDidQuery(localStorage.getItem("did") || "");
  const { data, isLoading } = useActorCompatibilityQuery(profile.data?.did);
  const currentUserDid = localStorage.getItem("did");

  const getBorderColor = (percentage: number | undefined) => {
    if (!percentage) return "#666666";
    if (percentage >= 80) return "#19d825"; // Green
    if (percentage >= 60) return "#ffd700"; // Gold
    if (percentage >= 40) return "#ff8c00"; // Orange
    return "#ff4500"; // Red
  };

  const percentage = data?.compatibility?.compatibilityPercentage || 0;
  const borderColor = getBorderColor(percentage);

  return (
    <>
      {currentUserDid &&
        data &&
        data.compatibility &&
        currentUserDid != profile.data?.did &&
        !isLoading && (
          <div className="mt-[20px] ml-[19px] flex flex-row items-center">
            <div
              style={{
                position: "relative",
                width: "54px",
                height: "54px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: `conic-gradient(${borderColor} 0deg ${(percentage / 100) * 360}deg, transparent ${(percentage / 100) * 360}deg 360deg)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "var(--color-background)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Avatar
                    name={currentUser.data?.displayName}
                    src={currentUser.data?.avatar}
                    size="46px"
                  />
                </div>
              </div>
            </div>
            <div className="ml-[10px] text-[14px]">
              <div className="!text-[var(--color-text)]">
                Your compatibility with <b>@{profile.data?.handle}</b> is{" "}
                <span style={{ color: borderColor }}>
                  <b>{data.compatibility?.compatibilityLevel}</b>
                </span>
              </div>
              <div className="!text-[var(--color-text)] mt-[5px]">
                You both listen to{" "}
                {(data.compatibility?.topSharedDetailedArtists || []).map(
                  (artist, index) => (
                    <div key={artist.id} className="inline">
                      <Link
                        to={
                          `/${artist.uri.split("at://")[1].replace("app.rocksky.", "")}` as string
                        }
                        className="no-underline"
                      >
                        <span className="mt-[0px] mb-[0px] text-[14px] !text-[var(--color-primary)]">
                          {artist.name}
                        </span>
                      </Link>
                      {index !==
                        (data.compatibility?.topSharedDetailedArtists || [])
                          .length -
                          1 &&
                        (index ===
                        (data.compatibility?.topSharedDetailedArtists || [])
                          .length -
                          2
                          ? " and "
                          : ", ")}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        )}
    </>
  );
}

export default Compatibility;
