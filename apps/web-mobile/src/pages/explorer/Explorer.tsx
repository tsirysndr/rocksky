import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import numeral from "numeral";
import { useState } from "react";
import Main from "../../layouts/Main";
import { rocksky } from "../../lib/rocksky";
import type { EntityKey } from "./fields";
import { ENTITIES, entityOf } from "./fields";
import Results, { type ResultSet } from "./Results";
import RsqlEditor from "./RsqlEditor";

/* The app is dark-only, so these are the dark values from the web explorer. */
const syntaxTheme = css`
  --rsql-field: #c4b5fd;
  --rsql-op: #67e8f9;
  --rsql-value: #fdba74;
  --rsql-string: #86efac;
  --rsql-logic: #f9a8d4;
  --rsql-paren: #a1a1aa;
  --rsql-bad: #fca5a5;
  --explorer-tab: var(--color-purple);
  --explorer-run: var(--color-primary);
`;

const Page = styled.div`
  ${syntaxTheme}
  padding: 16px 16px 40px;
`;

const Title = styled.h1`
  margin: 0 0 4px;
  font-size: 1.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const Subtitle = styled.p`
  margin: 0 0 18px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-muted);

  code {
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
`;

/* Bleeds to the screen edges so the tab strip reads as scrollable. */
const Tabs = styled.div`
  display: flex;
  gap: 8px;
  margin: 0 -16px 16px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
`;

const TabButton = styled.button<{ active: boolean }>`
  flex-shrink: 0;
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid
    ${({ active }) => (active ? "transparent" : "var(--color-border)")};
  background: ${({ active }) =>
    active ? "var(--explorer-tab)" : "transparent"};
  color: ${({ active }) => (active ? "#fff" : "var(--color-text-muted)")};
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  cursor: pointer;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
`;

const RunButton = styled.button`
  flex: 1;
  padding: 11px 20px;
  border: none;
  border-radius: 999px;
  background: var(--explorer-run);
  color: #fff;
  font-family: RockfordSansMedium;
  font-size: 0.875rem;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
  }
`;

const GhostButton = styled.button`
  padding: 11px 18px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font-family: RockfordSansMedium;
  font-size: 0.875rem;
  cursor: pointer;
`;

const Hint = styled.p`
  margin: 10px 0 0;
  font-size: 0.72rem;
  color: var(--color-text-muted);
`;

const Examples = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 14px -16px 0;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
`;

const ExampleChip = styled.button`
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
`;

const ExamplesLabel = styled.span`
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const ErrorBox = styled.div`
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--rsql-bad);
  background: rgba(220, 38, 38, 0.12);
  color: var(--color-text);
  font-size: 0.78rem;
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
`;

const ResultsHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 28px 0 12px;
`;

const ResultsTitle = styled.h2`
  margin: 0;
  font-size: 0.9375rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const ResultsCount = styled.span`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const Empty = styled.div`
  padding: 48px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
`;

const LoadMore = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 20px;
`;

const PAGE_SIZE = 50;

async function run(
  key: EntityKey,
  filter: string,
  limit: number,
): Promise<ResultSet> {
  const client = rocksky();
  const expression = filter.trim() || undefined;
  switch (key) {
    case "songs":
      return {
        key,
        items: await client.catalogSongs(limit, 0, undefined, expression),
      };
    case "albums":
      return {
        key,
        items: await client.catalogAlbums(limit, 0, undefined, expression),
      };
    case "artists":
      return {
        key,
        items: await client.catalogArtists(limit, 0, undefined, expression),
      };
    case "playlists": {
      const out = await client.playlists(limit, 0, expression);
      return { key, items: out.playlists ?? [] };
    }
    case "scrobbles":
      return {
        key,
        items: await client.scrobbleFeed(
          undefined,
          false,
          limit,
          0,
          expression,
        ),
      };
  }
}

function Explorer() {
  const [entityKey, setEntityKey] = useState<EntityKey>("songs");
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<{
    key: EntityKey;
    filter: string;
    limit: number;
    nonce: number;
  } | null>(null);

  const entity = entityOf(entityKey);

  const query = useQuery({
    queryKey: [
      "explorer",
      submitted?.key,
      submitted?.filter,
      submitted?.limit,
      submitted?.nonce,
    ],
    enabled: !!submitted,
    retry: false,
    queryFn: () => run(submitted!.key, submitted!.filter, submitted!.limit),
  });

  const execute = (limit = PAGE_SIZE) =>
    setSubmitted((prev) => ({
      key: entityKey,
      filter: draft,
      limit,
      nonce: (prev?.nonce ?? 0) + 1,
    }));

  const switchEntity = (key: EntityKey) => {
    setEntityKey(key);
    setDraft("");
    setSubmitted(null);
  };

  const result = query.data;
  const count = result?.items.length ?? 0;
  const canLoadMore = !!submitted && count >= submitted.limit;

  return (
    <Main>
      <Page>
        <Title>Explore</Title>
        <Subtitle>
          Query the Rocksky catalog with RSQL. Combine predicates with{" "}
          <code>;</code> (and) and <code>,</code> (or), group them with
          parentheses, and use <code>*</code> as a wildcard in string values.
        </Subtitle>

        <Tabs>
          {ENTITIES.map((e) => (
            <TabButton
              key={e.key}
              type="button"
              active={e.key === entityKey}
              onClick={() => switchEntity(e.key)}
            >
              {e.label}
            </TabButton>
          ))}
        </Tabs>

        <RsqlEditor
          entity={entity}
          value={draft}
          onChange={setDraft}
          onRun={() => execute()}
        />

        <Toolbar>
          <RunButton type="button" onClick={() => execute()}>
            {query.isFetching ? "Running…" : "Run query"}
          </RunButton>
          <GhostButton
            type="button"
            onClick={() => {
              setDraft("");
              setSubmitted(null);
            }}
          >
            Clear
          </GhostButton>
        </Toolbar>
        <Hint>Tap a suggestion to complete · return runs the query</Hint>

        <Examples>
          <ExamplesLabel>Try:</ExamplesLabel>
          {entity.examples.map((example) => (
            <ExampleChip
              key={example.filter}
              type="button"
              onClick={() => setDraft(example.filter)}
            >
              {example.label}
            </ExampleChip>
          ))}
        </Examples>

        {query.isError && (
          <ErrorBox>
            {query.error instanceof Error
              ? query.error.message
              : String(query.error)}
          </ErrorBox>
        )}

        {submitted && !query.isError && (
          <>
            <ResultsHead>
              <ResultsTitle>{entityOf(submitted.key).label}</ResultsTitle>
              <ResultsCount>
                {query.isFetching && !result
                  ? "…"
                  : `${numeral(count).format("0,0")} result${count === 1 ? "" : "s"}`}
              </ResultsCount>
            </ResultsHead>
            {result && count > 0 ? (
              <>
                <Results result={result} />
                {canLoadMore && (
                  <LoadMore>
                    <GhostButton
                      type="button"
                      onClick={() => execute(submitted.limit + PAGE_SIZE)}
                    >
                      {query.isFetching ? "Loading…" : "Load more"}
                    </GhostButton>
                  </LoadMore>
                )}
              </>
            ) : (
              <Empty>
                {query.isFetching
                  ? "Running your query…"
                  : "Nothing matched that filter."}
              </Empty>
            )}
          </>
        )}
      </Page>
    </Main>
  );
}

export default Explorer;
