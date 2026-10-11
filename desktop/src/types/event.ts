export type RsvpStatus =
  | "community.lexicon.calendar.rsvp#going"
  | "community.lexicon.calendar.rsvp#interested"
  | "community.lexicon.calendar.rsvp#notgoing";

/** Fields used from app.rocksky.event.defs#eventView. */
export interface ArtistEvent {
  uri: string;
  viewerRsvp?: RsvpStatus;
  name: string;
  artists?: { name: string }[];
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
  const venue = event.locations.find((place) => place.name)?.name;
  const city = event.locations.find((place) => place.locality)?.locality;
  const weekday = validDate?.toLocaleDateString(undefined, {
    weekday: "short",
  });
  const time = validDate?.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    city:
      city ||
      (event.mode?.endsWith("#virtual") ? "Online" : venue || event.name),
    lineup:
      event.artists?.map((artist) => artist.name).join(", ") || event.name,
    schedule: [
      validDate ? `${weekday} ${time}` : "Date to be announced",
      venue || "Venue to be announced",
    ].join(" • "),
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
