import { describe, expect, it } from "vitest";
import { completionAt, tokenize } from "./rsql";

const KNOWN = new Set([
  "artist",
  "duration",
  "genre",
  "title",
  "track.artist",
]);

const kinds = (input: string) =>
  tokenize(input, KNOWN)
    .filter((t) => t.kind !== "space")
    .map((t) => `${t.kind}:${t.text}`);

describe("tokenize", () => {
  it("classifies a compound expression", () => {
    expect(kinds('artist=="Daft Punk";duration=gt=300000')).toEqual([
      "field:artist",
      "op:==",
      'string:"Daft Punk"',
      "logic:;",
      "field:duration",
      "op:=gt=",
      "value:300000",
    ]);
  });

  it("classifies list values", () => {
    expect(kinds("genre=in=(House,Techno)")).toEqual([
      "field:genre",
      "op:=in=",
      "paren:(",
      "value:House",
      "logic:,",
      "value:Techno",
      "paren:)",
    ]);
  });

  it("flags a field that is not in the allowlist", () => {
    expect(kinds('bogus=="x"')[0]).toBe("unknown-field:bogus");
  });

  it("flags an unterminated string", () => {
    expect(kinds('artist=="unclosed')).toEqual([
      "field:artist",
      "op:==",
      'error:"unclosed',
    ]);
  });

  it("reads `and` / `or` as logic, not as a field", () => {
    expect(kinds('title=="a" and duration=lt=100')).toEqual([
      "field:title",
      "op:==",
      'string:"a"',
      "logic:and",
      "field:duration",
      "op:=lt=",
      "value:100",
    ]);
  });

  it("keeps dotted selectors whole", () => {
    expect(kinds('track.artist=="x"')[0]).toBe("field:track.artist");
  });

  it("covers the whole input exactly once", () => {
    const input = 'artist=="Daft Punk";duration=gt=300000';
    const tokens = tokenize(input, KNOWN);
    expect(tokens.map((t) => t.text).join("")).toBe(input);
  });
});

describe("completionAt", () => {
  it("completes a field from a partial word", () => {
    expect(completionAt("art", 3)).toMatchObject({
      what: "field",
      prefix: "art",
      from: 0,
      to: 3,
    });
  });

  it("keeps offering fields mid-word, so artist can still become artistUri", () => {
    expect(completionAt("artist", 6)).toMatchObject({
      what: "field",
      prefix: "artist",
    });
  });

  it("completes a partially typed operator", () => {
    expect(completionAt("artist=", 7)).toMatchObject({
      what: "op",
      prefix: "=",
      field: "artist",
      from: 6,
      to: 7,
    });
  });

  it("offers values after a complete operator", () => {
    expect(completionAt("artist==", 8)).toMatchObject({
      what: "value",
      prefix: "",
      field: "artist",
    });
  });

  it("completes a partially typed value", () => {
    expect(completionAt("duration=gt=30", 14)).toMatchObject({
      what: "value",
      prefix: "30",
      field: "duration",
      from: 12,
      to: 14,
    });
  });

  it("goes back to fields after a logic operator", () => {
    expect(completionAt('artist=="A";du', 14)).toMatchObject({
      what: "field",
      prefix: "du",
      from: 12,
      to: 14,
    });
  });
});
