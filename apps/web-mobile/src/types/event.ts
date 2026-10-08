/** Fields used from app.rocksky.event.defs#eventView. */
export interface ArtistEvent {
  uri: string;
  name: string;
  startsAt?: string;
  status?: string;
  mode?: string;
  ticketsUrl?: string;
  locations: {
    name?: string;
    locality?: string;
    region?: string;
    country?: string;
  }[];
  uris: { uri: string; name?: string }[];
}

export function eventLink(event: ArtistEvent) {
  const urls = [event.ticketsUrl, ...event.uris.map((link) => link.uri)];
  return urls.find((url) => url && /^https?:\/\//i.test(url));
}

export function eventDetails(event: ArtistEvent) {
  const date = event.startsAt ? new Date(event.startsAt) : undefined;
  const validDate = date && Number.isFinite(date.getTime()) ? date : undefined;
  const location = event.locations
    .map((place) =>
      [place.name, place.locality, place.region, place.country]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean)
    .join(" · ");
  const status = event.status?.split("#").pop();
  return {
    month:
      validDate?.toLocaleDateString(undefined, { month: "short" }) ?? "TBA",
    day: validDate?.getDate().toString() ?? "—",
    date:
      validDate?.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }) ?? "Date to be announced",
    location:
      location ||
      (event.mode?.endsWith("#virtual")
        ? "Online event"
        : "Venue to be announced"),
    status:
      status && ["cancelled", "postponed", "rescheduled"].includes(status)
        ? status
        : undefined,
  };
}
