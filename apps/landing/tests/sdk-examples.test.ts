import { describe, expect, test } from "bun:test";
import { sdkExamples } from "../src/sdk-examples";
import sdkTokens from "../src/sdk-tokens.json";

describe("published SDK examples", () => {
  test("highlighted examples preserve the exact copyable source in all ten languages", () => {
    expect(sdkExamples).toHaveLength(10);
    for (const example of sdkExamples) {
      const lines = sdkTokens[example.id as keyof typeof sdkTokens];
      expect(
        lines
          .map((line) => line.map((token) => token.content).join(""))
          .join("\n"),
      ).toBe(example.code);
      expect(
        new Set(lines.flat().map((token) => token.color)).size,
      ).toBeGreaterThan(1);
    }
  });
  test("PureScript setup uses an unpublished local package", () => {
    const example = sdkExamples.find((item) => item.id === "purescript")!;
    expect(example.setup).toContain("extraPackages:");
    expect(example.setup).toContain("path: /path/to/rocksky/sdk/purescript");
    expect(example.setup).not.toContain("spago install");
  });
});
