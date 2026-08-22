import { describe, expect, test } from "bun:test";
import { AlbumFields, ArtistFields, Filter, ScrobbleFields, SongFields } from "./filter.js";

describe("Filter", () => {
  test("eq renders a bare value when safe", () => {
    expect(Filter.eq("artist", "Radiohead").build()).toBe("artist==Radiohead");
  });

  test("eq quotes values with spaces", () => {
    expect(Filter.eq("artist", "Daft Punk").build()).toBe('artist=="Daft Punk"');
  });

  test("eq escapes embedded quotes and backslashes", () => {
    expect(Filter.eq("title", 'He said "hi"').build()).toBe('title=="He said \\"hi\\""');
    expect(Filter.eq("title", "back\\slash").build()).toBe('title=="back\\\\slash"');
  });

  test("wildcards pass through unquoted", () => {
    expect(Filter.eq("artist", "Daft*").build()).toBe("artist==Daft*");
  });

  test("ne", () => {
    expect(Filter.ne("artist", "Eminem").build()).toBe("artist!=Eminem");
  });

  test("ordered comparisons render verbose operators", () => {
    expect(Filter.gt("duration", 200000).build()).toBe("duration=gt=200000");
    expect(Filter.ge("year", 2000).build()).toBe("year=ge=2000");
    expect(Filter.lt("trackNumber", 5).build()).toBe("trackNumber=lt=5");
    expect(Filter.le("year", 1999).build()).toBe("year=le=1999");
  });

  test("in and out lists", () => {
    expect(Filter.in("genre", ["house", "electro"]).build()).toBe("genre=in=(house,electro)");
    expect(Filter.out("genre", ["hip hop"]).build()).toBe('genre=out=("hip hop")');
  });

  test("in/out reject empty lists", () => {
    expect(() => Filter.in("genre", [])).toThrow();
    expect(() => Filter.out("genre", [])).toThrow();
  });

  test("null checks", () => {
    expect(Filter.isNull("uri").build()).toBe("uri==null");
    expect(Filter.isNotNull("uri").build()).toBe("uri!=null");
  });

  test("and joins with ;", () => {
    const f = Filter.eq("artist", "Radiohead").and(Filter.gt("duration", 200000));
    expect(f.build()).toBe("artist==Radiohead;duration=gt=200000");
  });

  test("or joins with ,", () => {
    const f = Filter.eq("artist", "Radiohead").or(Filter.eq("artist", "Muse"));
    expect(f.build()).toBe("artist==Radiohead,artist==Muse");
  });

  test("or nested in and is parenthesized", () => {
    const left = Filter.eq("artist", "Radiohead").or(Filter.eq("artist", "Muse"));
    expect(left.and(Filter.gt("duration", 200000)).build()).toBe(
      "(artist==Radiohead,artist==Muse);duration=gt=200000",
    );
    const right = Filter.eq("genre", "house").or(Filter.eq("genre", "electro"));
    expect(Filter.eq("artist", "Radiohead").and(right).build()).toBe(
      "artist==Radiohead;(genre==house,genre==electro)",
    );
  });

  test("and nested in or needs no parentheses", () => {
    const f = Filter.eq("artist", "Radiohead")
      .and(Filter.gt("duration", 200000))
      .or(Filter.eq("genre", "house"));
    expect(f.build()).toBe("artist==Radiohead;duration=gt=200000,genre==house");
  });

  test("booleans and dotted fields", () => {
    expect(Filter.eq("user.handle", "tsiry.dev").build()).toBe("user.handle==tsiry.dev");
    expect(Filter.eq("liked", true).build()).toBe("liked==true");
  });

  test("toString matches build so filters interpolate", () => {
    const f = Filter.eq("artist", "Radiohead");
    expect(`${f}`).toBe(f.build());
  });

  test("field constants map to server selectors", () => {
    expect(SongFields.albumArtist).toBe("albumArtist");
    expect(AlbumFields.releaseDate).toBe("releaseDate");
    expect(ArtistFields.genres).toBe("genres");
    expect(ScrobbleFields.trackArtist).toBe("track.artist");
    expect(ScrobbleFields.userHandle).toBe("user.handle");
    expect(Filter.eq(ScrobbleFields.artistGenres, "house").build()).toBe("artist.genres==house");
  });
});
