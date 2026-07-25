import styled from "@emotion/styled";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { type Mention, segmentText } from "../../lib/richtext";

/**
 * Renders a shout message as rich text: bare URLs become external links and
 * `@mentions` become links to the mentioned user's profile. When the shout
 * carries mention facets the links resolve to the exact DID; otherwise
 * `@handles` are detected heuristically. Messages are still stored as plain
 * strings + facets — this is purely presentational.
 */

const Anchor = styled.a`
  color: var(--color-primary);
  text-decoration: none;
  word-break: break-word;

  &:hover {
    text-decoration: underline;
  }
`;

const MentionLink = styled(Link)`
  color: var(--color-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

interface RichTextProps {
  children: string;
  facets?: Mention[];
}

function RichText({ children, facets }: RichTextProps) {
  const segments = segmentText(children, facets);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "mention" ? (
          <MentionLink key={i} to={`/profile/${seg.target}`}>
            {seg.value}
          </MentionLink>
        ) : seg.type === "link" ? (
          <Anchor
            key={i}
            href={seg.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {seg.value}
          </Anchor>
        ) : (
          <Fragment key={i}>{seg.value}</Fragment>
        ),
      )}
    </>
  );
}

export default RichText;
