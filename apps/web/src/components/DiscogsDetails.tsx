import styled from "@emotion/styled";
import {
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
} from "@tabler/icons-react";
import type { AlbumDiscogsView } from "@rocksky/sdk";

type Detail = { label: string; value: string };
type Section = { title: string; rows: Detail[] };
const text = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return value === undefined || value === null ? "" : String(value).trim();
};
const rows = (values: [string, unknown][]): Detail[] =>
  values
    .map(([label, value]) => ({ label, value: text(value) }))
    .filter((row) => row.value !== "");
const join = (...values: unknown[]) =>
  values.map(text).filter(Boolean).join(" · ");
function discogsSections(d: AlbumDiscogsView): Section[] {
  return [
    {
      title: "Release",
      rows: rows([
        ["Title", d.title],
        ["Artist", d.artist],
        ["Release date", d.releaseDate],
        ["Year", d.year],
        ["Original year", d.originalYear],
        ["Country", d.country],
        ["Label", d.label],
        ["Catalog number", d.catalogNumber],
        ["Barcode", d.barcode],
        ["Formats", d.formats],
        ["Genres", d.genres],
        ["Styles", d.styles],
        ["Release ID", d.releaseId],
        ["Master ID", d.masterId],
        [
          "Match confidence",
          d.score === undefined || d.score === null ? undefined : `${d.score}%`,
        ],
      ]),
    },
    {
      title: "Artists",
      rows: (d.artists ?? []).map((a) => ({
        label: text(a.name) || "Artist",
        value: join(
          a.anv && `Credited as ${a.anv}`,
          a.role,
          a.joinPhrase && `Join: ${a.joinPhrase}`,
          a.artistId && `Discogs artist ${a.artistId}`,
        ),
      })),
    },
    {
      title: "Labels and companies",
      rows: (d.labels ?? []).map((l) => ({
        label: text(l.name) || "Label / company",
        value: join(
          l.entityType || l.kind,
          l.catalogNumber,
          l.labelId && `Discogs label ${l.labelId}`,
        ),
      })),
    },
    {
      title: "Identifiers",
      rows: (d.identifiers ?? []).map((i) => ({
        label: text(i.type) || "Identifier",
        value: join(i.value, i.description),
      })),
    },
    {
      title: "Credits",
      rows: (d.credits ?? []).map((c) => ({
        label: text(c.name) || "Credit",
        value: join(
          c.role,
          c.tracks && `Tracks: ${c.tracks}`,
          c.artistId && `Discogs artist ${c.artistId}`,
        ),
      })),
    },
    {
      title: "Discogs tracklist",
      rows: (d.tracklist ?? []).map((t) => ({
        label: join(t.position, t.title) || "Track",
        value: join(
          t.duration ||
            (t.durationMs !== undefined
              ? `${Math.floor(t.durationMs / 60000)}:${String(Math.floor(t.durationMs / 1000) % 60).padStart(2, "0")}`
              : undefined),
          t.discNumber && `Disc ${t.discNumber}`,
          t.trackNumber && `Track ${t.trackNumber}`,
          t.type && t.type !== "track" ? t.type : undefined,
        ),
      })),
    },
    {
      title: "Master release",
      rows: d.master
        ? rows([
            ["Title", d.master.title],
            ["Artist", d.master.artist],
            ["Year", d.master.year],
            ["Master ID", d.master.masterId],
            ["Main release ID", d.master.mainReleaseId],
            ["Genres", d.master.genres],
            ["Styles", d.master.styles],
          ])
        : [],
    },
  ].filter((section) => section.rows.length > 0);
}
export function discogsUrl(
  url?: string,
  id?: number,
  kind = "release",
): string | undefined {
  if (url) {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === "https:" &&
        ["discogs.com", "www.discogs.com"].includes(parsed.hostname)
      )
        return parsed.href;
    } catch {
      /* Use the release ID if the stored URL is invalid. */
    }
  }
  return id && Number.isSafeInteger(id) && id > 0
    ? `https://www.discogs.com/${kind}/${id}`
    : undefined;
}

const Accordion = styled.details`
  margin-top: 24px;
  color: var(--color-text);
  border-top: 1px solid var(--color-border, var(--color-surface-2));
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 0;
    cursor: pointer;
    font-weight: 600;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 4px;
  }
  .chevron-up {
    display: none;
  }
  &[open] .chevron-up {
    display: block;
  }
  &[open] .chevron-down {
    display: none;
  }
  h3 {
    font-size: 14px;
    margin: 0 0 12px;
  }
  section {
    margin: 0 0 24px;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 12px;
  }
  .detail-row {
    display: grid;
    grid-template-columns: minmax(100px, 160px) minmax(0, 1fr);
    gap: 16px;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    white-space: pre-wrap;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: inherit;
    text-underline-offset: 4px;
  }
`;
export default function DiscogsDetails({
  discogs,
}: {
  discogs?: AlbumDiscogsView | null;
}) {
  if (!discogs || Object.keys(discogs).length === 0) return null;
  const url = discogsUrl(discogs.url, discogs.releaseId);
  const masterUrl = discogsUrl(
    discogs.master?.url,
    discogs.master?.masterId ?? discogs.masterId,
    "master",
  );
  return (
    <Accordion key={discogs.releaseId ?? url ?? discogs.title}>
      <summary>
        Discogs details
        <span aria-hidden="true">
          <IconChevronDown className="chevron-down" size={20} />
          <IconChevronUp className="chevron-up" size={20} />
        </span>
      </summary>
      {discogsSections(discogs).map((section) => (
        <section key={section.title} aria-label={section.title}>
          <h3>{section.title}</h3>
          <dl>
            {section.rows.map((row, i) => (
              <div className="detail-row" key={`${row.label}-${i}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          paddingBottom: 20,
        }}
      >
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            View on Discogs <IconExternalLink size={16} aria-hidden="true" />
          </a>
        )}
        {masterUrl && (
          <a href={masterUrl} target="_blank" rel="noopener noreferrer">
            View master release{" "}
            <IconExternalLink size={16} aria-hidden="true" />
          </a>
        )}
        {discogs.albumArt && /^https:\/\//.test(discogs.albumArt) && (
          <a href={discogs.albumArt} target="_blank" rel="noopener noreferrer">
            Release artwork <IconExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </div>
    </Accordion>
  );
}
