import { useArtistEvents } from "../hooks/useArtistEvents";
import { eventDetails, eventLink } from "../types/event";

export default function OnTour({
  artistUri,
  artistName,
}: {
  artistUri?: string;
  artistName?: string;
}) {
  const query = useArtistEvents(artistUri);
  const events = [
    ...new Map(
      query.data?.pages.flat().map((event) => [event.uri, event]),
    ).values(),
  ];
  if (!events.length) return null;

  return (
    <section
      aria-label="On tour"
      className="my-8"
      style={{ color: "var(--color-text)" }}
    >
      <h2 className="text-xl font-bold m-0">On tour</h2>
      <p
        className="text-sm mt-1 mb-4"
        style={{ color: "var(--color-text-muted)" }}
      >
        {artistName ? `See ${artistName} live` : "Upcoming events"}
      </p>
      <ul className="list-none p-0 m-0 flex flex-col gap-3">
        {events.map((event) => {
          const details = eventDetails(event);
          const href = eventLink(event);
          return (
            <li
              key={event.uri}
              className="flex gap-4 items-start rounded-xl p-4"
              style={{ backgroundColor: "var(--color-input-background)" }}
            >
              <div
                aria-hidden="true"
                className="shrink-0 w-14 rounded-lg py-2 text-center"
                style={{ backgroundColor: "var(--color-background)" }}
              >
                <div className="text-xs uppercase font-semibold">
                  {details.month}
                </div>
                <div className="text-2xl font-bold">{details.day}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs m-0 mb-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {details.date}
                </p>
                <h3 className="text-base font-semibold m-0 break-words">
                  {event.name}
                </h3>
                <p
                  className="text-sm mt-1 mb-0 break-words"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {details.location}
                </p>
                {details.status && (
                  <p className="text-xs capitalize mt-2 mb-0 font-semibold">
                    {details.status}
                  </p>
                )}
                {href &&
                  details.status !== "cancelled" &&
                  details.status !== "postponed" && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center min-h-11 mt-2 text-sm font-semibold underline underline-offset-4"
                      style={{ color: "var(--color-text)" }}
                      aria-label={`${event.ticketsUrl === href ? "Find tickets" : "Event details"} for ${event.name} (opens in new tab)`}
                    >
                      {event.ticketsUrl === href
                        ? "Find tickets"
                        : "Event details"}{" "}
                      ↗
                    </a>
                  )}
              </div>
            </li>
          );
        })}
      </ul>
      {query.isFetchNextPageError && (
        <p role="status" className="text-sm">
          Couldn’t load more events. Please try again.
        </p>
      )}
      {query.hasNextPage && (
        <button
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          className="mt-4 min-h-11 px-5 rounded-full border border-current text-sm font-semibold cursor-pointer disabled:opacity-50"
        >
          {query.isFetchingNextPage
            ? "Loading…"
            : query.isFetchNextPageError
              ? "Try again"
              : "Show more events"}
        </button>
      )}
    </section>
  );
}
