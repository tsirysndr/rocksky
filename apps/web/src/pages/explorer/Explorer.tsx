import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import numeral from "numeral";
import { useState } from "react";
import BackButton from "../../components/BackButton";
import Main from "../../layouts/Main";
import { rocksky } from "../../lib/rocksky";
import type { EntityKey } from "./fields";
import { ENTITIES, entityOf } from "./fields";
import Results, { type ResultSet } from "./Results";
import RsqlEditor from "./RsqlEditor";

const syntaxTheme = css`
  --rsql-field: #7c3aed;
  --rsql-op: #0e7490;
  --rsql-value: #b45309;
  --rsql-string: #047857;
  --rsql-logic: #be185d;
  --rsql-paren: #64748b;
  --rsql-bad: #dc2626;
  --explorer-tab: var(--color-purple);
  --explorer-run: var(--color-primary);

  .dark & {
    --rsql-field: #c4b5fd;
    --rsql-op: #67e8f9;
    --rsql-value: #fdba74;
    --rsql-string: #86efac;
    --rsql-logic: #f9a8d4;
    --rsql-paren: #a1a1aa;
    --rsql-bad: #fca5a5;
  }
`;

const Page = styled.div`
  ${syntaxTheme}
  margin-top: 70px;
  margin-bottom: 160px;
`;

const Title = styled.h1`
  margin: 0 0 4px;
  font-size: 1.75rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const Subtitle = styled.p`
  margin: 0 0 22px;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

const Tabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const TabButton = styled.button<{ active: boolean }>`
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid
    ${({ active }) => (active ? "transparent" : "rgba(128,128,128,0.28)")};
  background: ${({ active }) =>
    active ? "var(--explorer-tab)" : "transparent"};
  color: ${({ active }) => (active ? "#fff" : "var(--color-text-muted)")};
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    color: ${({ active }) => (active ? "#fff" : "var(--color-text)")};
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
`;

const RunButton = styled.button`
  padding: 9px 20px;
  border: none;
  border-radius: 999px;
  background: var(--explorer-run);
  color: #fff;
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const GhostButton = styled.button`
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  background: transparent;
  color: var(--color-text-muted);
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
`;

const Kbd = styled.span`
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-muted);

  kbd {
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
`;

const Examples = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
`;

const ExampleChip = styled.button`
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px dashed rgba(128, 128, 128, 0.35);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
    border-style: solid;
  }
`;

const ExamplesLabel = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const Error = styled.div`
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--rsql-bad);
  background: rgba(220, 38, 38, 0.08);
  color: var(--color-text);
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
`;

const ResultsHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 32px 0 14px;
`;

const ResultsTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const ResultsCount = styled.span`
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const Empty = styled.div`
  padding: 56px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
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
        <BackButton />
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
          <Kbd>
            <kbd>↑</kbd> <kbd>↓</kbd> to pick · <kbd>Tab</kbd> to complete ·{" "}
            <kbd>Enter</kbd> to run
          </Kbd>
        </Toolbar>

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
          <Error>
            {query.error instanceof globalThis.Error
              ? query.error.message
              : String(query.error)}
          </Error>
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
                  <div className="mt-[20px] flex justify-center">
                    <GhostButton
                      type="button"
                      onClick={() => execute(submitted.limit + PAGE_SIZE)}
                    >
                      {query.isFetching ? "Loading…" : "Load more"}
                    </GhostButton>
                  </div>
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
