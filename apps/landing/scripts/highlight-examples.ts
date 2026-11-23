import { createHighlighter, type BundledLanguage } from "shiki";
import { sdkExamples } from "../src/sdk-examples";

// Keep grammars and the highlighting engine out of the browser bundle.
const highlighter = await createHighlighter({
  themes: ["rose-pine"],
  langs: sdkExamples.map((example) => example.id as BundledLanguage),
});
try {
  const output = Object.fromEntries(
    sdkExamples.map((example) => [
      example.id,
      highlighter
        .codeToTokens(example.code, {
          lang: example.id,
          theme: "rose-pine",
        })
        .tokens.map((line) =>
          line.map(({ content, color, fontStyle }) => ({
            content,
            color,
            ...(fontStyle ? { fontStyle } : {}),
          })),
        ),
    ]),
  );
  await Bun.write(
    new URL("../src/sdk-tokens.json", import.meta.url),
    JSON.stringify(output) + "\n",
  );
} finally {
  highlighter.dispose();
}
