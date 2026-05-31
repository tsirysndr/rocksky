import { Link } from "react-router-dom";
import ContentLoader from "react-content-loader";
import dayjs from "dayjs";
import type { RecentListener } from "../../api/library";

interface RecentListenersProps {
  listeners?: RecentListener[];
  isLoading?: boolean;
}

export default function RecentListeners(props: RecentListenersProps) {
  const listeners = props.listeners ?? [];

  if (!props.isLoading && listeners.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h3
        className="font-semibold text-base mb-3 m-0"
        style={{ color: "var(--color-text)" }}
      >
        Recent Listeners
      </h3>

      {props.isLoading && (
        <ContentLoader
          width="100%"
          height={84}
          viewBox="0 0 400 84"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <circle cx={28 + i * 76} cy={28} r={24} />
              <rect x={4 + i * 76} y={60} rx={3} ry={3} width={48} height={8} />
              <rect x={10 + i * 76} y={72} rx={3} ry={3} width={36} height={6} />
            </g>
          ))}
        </ContentLoader>
      )}

      {!props.isLoading && (
        <div
          className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4"
          style={{ scrollbarWidth: "none" }}
        >
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
                className="flex flex-col items-center shrink-0"
                style={{ width: 72 }}
              >
                <Link
                  to={`/profile/${item.handle}`}
                  className="no-underline block"
                >
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden mb-1"
                    style={{ backgroundColor: "var(--color-surface-2)" }}
                  >
                    {item.avatar ? (
                      <img
                        src={item.avatar}
                        alt={item.displayName || item.handle}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="opacity-20 text-2xl">♪</span>
                      </div>
                    )}
                  </div>
                </Link>
                <Link
                  to={`/profile/${item.handle}`}
                  className="no-underline text-xs font-medium truncate w-full text-center"
                  style={{ color: "var(--color-text)" }}
                >
                  @{item.handle}
                </Link>
                {scrobblePath ? (
                  <Link
                    to={`/${scrobblePath}`}
                    className="no-underline truncate w-full text-center"
                    style={{
                      color: "var(--color-text-muted)",
                      fontSize: 10,
                    }}
                  >
                    {dateLabel}
                  </Link>
                ) : (
                  <span
                    className="truncate w-full text-center"
                    style={{
                      color: "var(--color-text-muted)",
                      fontSize: 10,
                    }}
                  >
                    {dateLabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
