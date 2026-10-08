import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OnTour from "./OnTour";
import { useArtistEvents } from "../hooks/useArtistEvents";

vi.mock("./EventRsvpButton", () => ({
  default: () => <div>RSVP controls</div>,
}));

vi.mock("../hooks/useArtistEvents", () => ({ useArtistEvents: vi.fn() }));

const event = {
  uri: "at://did:plc:test/community.lexicon.calendar.event/show",
  name: "Live in Paris",
  startsAt: "2027-06-12T19:00:00Z",
  locations: [{ name: "Olympia", locality: "Paris" }],
  uris: [],
  ticketsUrl: "https://example.com/tickets",
};

function render(pages: unknown[][] | undefined, extra = {}) {
  vi.mocked(useArtistEvents).mockReturnValue({
    data: pages ? { pages } : undefined,
    ...extra,
  } as unknown as ReturnType<typeof useArtistEvents>);
  return renderToStaticMarkup(
    <OnTour artistUri="at://artist" artistName="Artist" />,
  );
}

describe("On tour", () => {
  it("hides the entire section before data arrives and for an empty result", () => {
    expect(render(undefined)).toBe("");
    expect(render([[]])).toBe("");
  });

  it("renders events from every loaded page, deduplicates, and offers more", () => {
    const html = render(
      [
        [event],
        [event, { ...event, uri: "another-show", name: "Second show" }],
      ],
      { hasNextPage: true },
    );
    expect(html).toContain("On tour");
    expect(html).toContain("Olympia, Paris");
    expect(html).toContain("Second show");
    expect(html).toContain("View all upcoming concerts (2+)");
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain('href="https://example.com/tickets"');
  });

  it("previews nine concerts and shows the full available count", () => {
    const html = render([
      Array.from({ length: 13 }, (_, i) => ({
        ...event,
        uri: `show-${i}`,
        artists: [{ name: "Headliner" }, { name: "Support" }],
      })),
    ]);
    expect(html.match(/<li /g)).toHaveLength(9);
    expect(html).toContain("View all upcoming concerts (13)");
    expect(html).toContain("Headliner, Support");
    expect(html).toContain('title="Paris"');
    expect(html).not.toContain("Find tickets");
  });

  it("labels cancelled shows and omits ticket links", () => {
    const html = render([
      [{ ...event, status: "community.lexicon.calendar.event#cancelled" }],
    ]);
    expect(html).toContain("cancelled");
    expect(html).not.toContain("href=");
  });

  it("handles missing dates and venues without unsafe links", () => {
    const html = render([
      [
        {
          ...event,
          startsAt: undefined,
          locations: [],
          ticketsUrl: "javascript:alert(1)",
        },
      ],
    ]);
    expect(html).toContain("Date to be announced");
    expect(html).toContain("Venue to be announced");
    expect(html).not.toContain("href=");
  });
});
