import { Box, Text } from "ink";
import React from "react";

/**
 * A single fixed-width (or flex-grow) column in a list row. Fixed columns keep
 * every row aligned; the grow column fills the remaining space and its text is
 * ellipsized when too long.
 */
export function Cell({
  width,
  grow,
  right,
  children,
}: {
  width?: number;
  grow?: boolean;
  right?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      width={grow ? undefined : width}
      flexGrow={grow ? 1 : 0}
      flexShrink={grow ? 1 : 0}
      minWidth={0}
      marginRight={1}
      justifyContent={right ? "flex-end" : "flex-start"}
    >
      {children}
    </Box>
  );
}

/** Text that truncates with an ellipsis instead of wrapping. */
export function Ell(props: React.ComponentProps<typeof Text>) {
  return <Text wrap="truncate-end" {...props} />;
}
