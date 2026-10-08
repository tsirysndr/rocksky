import { describe, expect, test } from "bun:test";
import { startOfToday, toLocationView } from "./eventView";

describe("toLocationView", () => {
  test("flattens each community.lexicon.location shape", () => {
    expect(
      toLocationView({
        $type: "community.lexicon.location.address",
        name: "Le Trianon",
        country: "FR",
        locality: "Paris",
      }),
    ).toEqual({
      type: "community.lexicon.location.address",
      name: "Le Trianon",
      country: "FR",
      locality: "Paris",
    });
    expect(
      toLocationView({
        $type: "community.lexicon.location.fsq",
        fsq_place_id: "4b0",
      }),
    ).toEqual({ type: "community.lexicon.location.fsq", fsqPlaceId: "4b0" });
    expect(
      toLocationView({
        $type: "community.lexicon.location.hthree",
        value: "8a",
      }),
    ).toEqual({ type: "community.lexicon.location.hthree", h3: "8a" });
    expect(
      toLocationView({
        $type: "community.lexicon.calendar.event#uri",
        uri: "https://live.example",
      }),
    ).toEqual({
      type: "community.lexicon.calendar.event#uri",
      uri: "https://live.example",
    });
  });

  test("drops shapes it does not know", () => {
    expect(toLocationView({ $type: "example.place", name: "x" })).toBeNull();
    expect(toLocationView("not an object")).toBeNull();
  });
});

describe("startOfToday", () => {
  test("is the UTC midnight that started the current day", () => {
    const now = new Date("2026-12-01T22:15:00Z");
    expect(startOfToday(now).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
