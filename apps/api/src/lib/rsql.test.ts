import { describe, expect, it } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import tables from "schema";
import {
  compileRsqlFilter,
  type RsqlFieldMap,
  RsqlFilterError,
  rsqlSelectors,
} from "./rsql";

const FIELDS: RsqlFieldMap = {
  title: tables.tracks.title,
  artist: tables.tracks.artist,
  uri: tables.tracks.uri,
  genre: tables.tracks.genre,
  duration: { column: tables.tracks.duration, type: "number" },
  createdAt: { column: tables.tracks.createdAt, type: "date" },
  genres: { column: tables.artists.genres, type: "string[]" },
};

const dialect = new PgDialect();
const render = (expr: SQL) => dialect.sqlToQuery(expr);
const compile = (filter: string) => render(compileRsqlFilter(filter, FIELDS));

describe("compileRsqlFilter", () => {
  it("compiles equality to a parameterized comparison", () => {
    const q = compile('title=="Discovery"');
    expect(q.sql).toContain('"title" = ');
    expect(q.params).toEqual(["Discovery"]);
  });

  it("compiles inequality", () => {
    const q = compile("artist!=Eminem");
    expect(q.sql).toContain("<>");
    expect(q.params).toEqual(["Eminem"]);
  });

  it("compiles and/or with grouping", () => {
    const q = compile("(genre==house,genre==electro);duration=gt=200000");
    expect(q.sql).toContain(" or ");
    expect(q.sql).toContain(" and ");
    expect(q.params).toEqual(["house", "electro", 200000]);
  });

  it("supports verbose and/or combinators", () => {
    const q = compile("genre==house or genre==electro");
    expect(q.sql).toContain(" or ");
    expect(q.params).toEqual(["house", "electro"]);
  });

  it("translates * wildcards to case-insensitive like", () => {
    const q = compile("artist==Daft*");
    expect(q.sql.toLowerCase()).toContain("ilike");
    expect(q.params).toEqual(["Daft%"]);
  });

  it("escapes like metacharacters inside wildcard values", () => {
    const q = compile('artist=="*100%_*"');
    expect(q.params).toEqual(["%100\\%\\_%"]);
  });

  it("compiles negated wildcard to not ilike", () => {
    const q = compile("artist!=Daft*");
    expect(q.sql.toLowerCase()).toContain("not");
    expect(q.sql.toLowerCase()).toContain("ilike");
    expect(q.params).toEqual(["Daft%"]);
  });

  it("compiles =in= and =out=", () => {
    const q = compile("genre=in=(house,electro)");
    expect(q.sql).toContain(" in ");
    expect(q.params).toEqual(["house", "electro"]);

    const nq = compile("genre=out=(house,electro)");
    expect(nq.sql).toContain(" not in ");
    expect(nq.params).toEqual(["house", "electro"]);
  });

  it("compiles ordered comparisons with number coercion", () => {
    const q = compile("duration>=200000");
    expect(q.sql).toContain(">=");
    expect(q.params).toEqual([200000]);
  });

  it("coerces date fields to Date values", () => {
    const q = compileRsqlFilter("createdAt=ge=2025-01-01", FIELDS);
    const rendered = render(q);
    expect(rendered.params).toHaveLength(1);
  });

  it("rejects non-numeric values on number fields", () => {
    expect(() => compile("duration=gt=abc")).toThrow(RsqlFilterError);
  });

  it("rejects invalid dates on date fields", () => {
    expect(() => compile("createdAt=lt=not-a-date")).toThrow(RsqlFilterError);
  });

  it("compiles string[] equality to array containment", () => {
    const q = compile("genres==house");
    expect(q.sql).toContain("@>");
    expect(q.params).toEqual(["house"]);
  });

  it("compiles negated string[] equality to negated containment", () => {
    const q = compile("genres!=house");
    expect(q.sql).toContain("not");
    expect(q.sql).toContain("@>");
    expect(q.params).toEqual(["house"]);
  });

  it("compiles string[] =in= to array overlap", () => {
    const q = compile("genres=in=(house,electro)");
    expect(q.sql).toContain("&&");
    expect(q.params).toEqual(["house", "electro"]);
  });

  it("rejects ordered comparisons on string[] fields", () => {
    expect(() => compile("genres=gt=house")).toThrow(RsqlFilterError);
  });

  it("compiles null equality to is null / is not null", () => {
    expect(compile("uri==null").sql).toContain("is null");
    expect(compile("uri!=null").sql).toContain("is not null");
  });

  it("rejects unknown fields and lists the allowed ones", () => {
    expect(() => compile("password==hunter2")).toThrow(
      /Unknown filter field "password".*artist.*title/s,
    );
  });

  it("rejects malformed expressions", () => {
    expect(() => compile("title==")).toThrow(RsqlFilterError);
    expect(() => compile("title")).toThrow(RsqlFilterError);
  });
});

describe("rsqlSelectors", () => {
  it("collects the selectors of a compound expression", () => {
    expect(
      rsqlSelectors('name=="Road trip";track.artist=="Daft Punk"').sort(),
    ).toEqual(["name", "track.artist"]);
  });

  it("deduplicates repeated selectors", () => {
    expect(rsqlSelectors("track.artist==Air,track.artist==Phoenix")).toEqual([
      "track.artist",
    ]);
  });

  it("returns nothing for an absent or unparseable filter", () => {
    expect(rsqlSelectors(undefined)).toEqual([]);
    expect(rsqlSelectors("  ")).toEqual([]);
    expect(rsqlSelectors("title==")).toEqual([]);
  });
});
