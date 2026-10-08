import EventRsvpButton from "./EventRsvpButton";
import { useState } from "react";
import { useArtistEvents } from "../hooks/useArtistEvents";
import { eventDetails, eventLink } from "../types/event";
import "./OnTour.css";

export default function OnTour({
  artistUri,
  artistName,
}: {
  artistUri?: string;
  artistName?: string;
}) {
  const query = useArtistEvents(artistUri);
  const [expandedArtist, setExpandedArtist] = useState<string>();
  const expanded = expandedArtist === artistUri;
  const events = [
    ...new Map(
      query.data?.pages.flat().map((event) => [event.uri, event]),
    ).values(),
  ];
  if (!events.length) return null;
  const visibleEvents = expanded ? events : events.slice(0, 9);
  const canExpand = events.length > 9 || query.hasNextPage;

  return (
    <section
      aria-label={artistName ? `On tour: ${artistName}` : "On tour"}
      className="on-tour"
    >
      <header className="on-tour__header">
        <h2>On Tour</h2>
        {canExpand && (
          <button
            type="button"
            disabled={query.isFetchingNextPage}
            aria-expanded={expanded}
            onClick={() => {
              if (!expanded) setExpandedArtist(artistUri);
              if (query.hasNextPage) void query.fetchNextPage();
              else if (expanded) setExpandedArtist(undefined);
            }}
          >
            {query.isFetchingNextPage
              ? "Loading concerts…"
              : query.isFetchNextPageError
                ? "Try again"
                : expanded
                  ? query.hasNextPage
                    ? "View more upcoming concerts"
                    : "Show fewer concerts"
                  : `View all upcoming concerts (${events.length}${query.hasNextPage ? "+" : ""})`}
          </button>
        )}
      </header>
      <ul className="on-tour__grid">
        {visibleEvents.map((event) => {
          const details = eventDetails(event);
          const href =
            details.status === "cancelled" || details.status === "postponed"
              ? undefined
              : eventLink(event);
          const content = (
            <>
              <div aria-hidden="true" className="on-tour__date">
                <span>{details.month}</span>
                <strong>{details.day}</strong>
              </div>
              <div className="on-tour__info">
                <h3 title={details.city}>{details.city}</h3>
                <p title={details.lineup}>{details.lineup}</p>
                <p
                  title={`${details.date} · ${details.location} · Times shown in your local timezone`}
                >
                  {details.schedule}
                </p>
                {details.status && (
                  <p className="on-tour__status">{details.status}</p>
                )}
              </div>
            </>
          );
          const label = `${details.city}: ${event.name}, ${details.date}, ${details.location}`;
          return (
            <li key={event.uri} className="on-tour__row">
              {href ? (
                <a
                  className="on-tour__event"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label} (opens in new tab)`}
                >
                  {content}
                </a>
              ) : (
                <div className="on-tour__event" aria-label={label}>
                  {content}
                </div>
              )}
              {details.status !== "cancelled" && (
                <EventRsvpButton event={event} />
              )}
            </li>
          );
        })}
      </ul>
      {query.isFetchNextPageError && (
        <p role="status">Couldn’t load more events. Please try again.</p>
      )}
    </section>
  );
}
