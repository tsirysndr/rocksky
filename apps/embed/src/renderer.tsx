import { reactRenderer } from "@hono/react-renderer";

export const renderer = reactRenderer(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Rocksky</title>
        <link rel="stylesheet" href="/public/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
});
