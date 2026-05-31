import { Link } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { HeadingSmall } from "baseui/typography";
import dayjs from "dayjs";
import ContentLoader from "react-content-loader";
import type { RecentListener } from "../../api/library";

interface RecentListenersProps {
  listeners?: RecentListener[];
  isLoading?: boolean;
}

function RecentListeners(props: RecentListenersProps) {
  const listeners = props.listeners ?? [];

  if (!props.isLoading && listeners.length === 0) {
    return null;
  }

  return (
    <div className="mt-[50px] mb-[20px]">
      <HeadingSmall
        marginBottom={"15px"}
        className="!text-[var(--color-text)] !mb-[20px]"
      >
        Recent Listeners
      </HeadingSmall>
      {props.isLoading && (
        <ContentLoader
          width="100%"
          height={80}
          viewBox="0 0 800 80"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle cx={20 + i * 200} cy={40} r={24} />
              <rect x={50 + i * 200} y={24} rx={3} ry={3} width={120} height={12} />
              <rect x={50 + i * 200} y={44} rx={3} ry={3} width={80} height={10} />
            </g>
          ))}
        </ContentLoader>
      )}
      {!props.isLoading && (
        <div className="flex flex-row flex-wrap gap-x-[24px] gap-y-[16px]">
          {listeners.map((item) => {
            const scrobblePath = item.scrobbleUri
              ?.split("at://")[1]
              ?.replace("app.rocksky.", "");
            const dateLabel = item.timestamp
              ? dayjs(item.timestamp).fromNow()
              : "";
            return (
              <div
                key={item.id}
                className="flex flex-row items-center gap-[10px]"
              >
                <Link
                  to={`/profile/${item.handle}` as string}
                  className="no-underline"
                >
                  <Avatar
                    src={item.avatar}
                    name={item.displayName || item.handle}
                    size={"40px"}
                  />
                </Link>
                <div className="flex flex-col">
                  <Link
                    to={`/profile/${item.handle}` as string}
                    className="!text-[var(--color-text)] hover:underline no-underline text-[14px]"
                    style={{ fontWeight: 600 }}
                  >
                    @{item.handle}
                  </Link>
                  {scrobblePath ? (
                    <Link
                      to={`/${scrobblePath}` as string}
                      className="!text-[var(--color-text-muted)] hover:underline no-underline text-[12px]"
                    >
                      {dateLabel}
                    </Link>
                  ) : (
                    <span className="text-[var(--color-text-muted)] text-[12px]">
                      {dateLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RecentListeners;
