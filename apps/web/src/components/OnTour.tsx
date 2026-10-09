import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import EventRsvpButton from "./EventRsvpButton";
import { useEffect, useState, useRef, useId } from "react";
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
  useEffect(() => {
    if (
      expanded &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.isFetchNextPageError
    ) {
      void query.fetchNextPage();
    }
  }, [
    expanded,
    query.hasNextPage,
    query.isFetching,
    query.isFetchNextPageError,
    query.fetchNextPage,
  ]);
  const sectionRef = useRef<HTMLElement>(null);
  const [previewLimit, setPreviewLimit] = useState(6);
  const hasEvents = events.length > 0;
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const update = () => {
      const width = section.clientWidth;
      setPreviewLimit(width <= 520 ? 2 : width <= 1100 ? 4 : 6);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(section);
    return () => observer.disconnect();
  }, [hasEvents]);
  const listId = useId();
  if (!events.length) return null;
  const visibleEvents = expanded ? events : events.slice(0, previewLimit);
  const canExpand = events.length > previewLimit || query.hasNextPage;

  return (
    <section
      ref={sectionRef}
      aria-label={artistName ? `On tour: ${artistName}` : "On tour"}
      className="on-tour"
    >
      <header className="on-tour__header">
        <h2>On Tour</h2>
      </header>
      <ul id={listId} className="on-tour__grid">
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
      {canExpand && (
        <button
          type="button"
          className="on-tour__toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpandedArtist(expanded ? undefined : artistUri)}
        >
          <span>
            {expanded ? "Show fewer concerts" : "View all upcoming concerts"}
          </span>
          {expanded ? (
            <IconChevronUp size={20} aria-hidden="true" />
          ) : (
            <IconChevronDown size={20} aria-hidden="true" />
          )}
        </button>
      )}
      {expanded && query.isFetchingNextPage && (
        <p role="status">Loading more concerts…</p>
      )}
      {expanded && query.isFetchNextPageError && (
        <p role="status">
          Couldn’t load more events.{" "}
          <button
            type="button"
            className="on-tour__retry"
            onClick={() => query.fetchNextPage()}
          >
            Try again
          </button>
        </p>
      )}
    </section>
  );
}
