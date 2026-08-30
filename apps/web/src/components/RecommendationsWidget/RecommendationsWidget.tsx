import styled from "@emotion/styled";
import { IconSparkles } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { profileAtom } from "../../atoms/profile";
import { useTrackRecommendationsQuery } from "../../hooks/useRecommendations";
import { uriToPath } from "../../lib/uri";

const PREVIEW_COUNT = 5;

const Container = styled.div`
  margin-bottom: 20px;
`;

const Header = styled(Link)`
  display: flex;
  align-items: center;
  color: var(--color-text);
  font-size: 15px;
  font-weight: bold;
  text-decoration: none;
  opacity: 0.8;
  &:hover {
    opacity: 1;
  }
`;

const Item = styled(Link)`
  display: flex;
  align-items: center;
  margin-top: 10px;
  text-decoration: none;
  min-width: 0;
  &:hover {
    opacity: 0.8;
  }
`;

const Art = styled.img`
  width: 36px;
  height: 36px;
  border-radius: 4px;
  margin-right: 10px;
  flex-shrink: 0;
`;

const ArtFallback = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 4px;
  margin-right: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-menu-hover);
  opacity: 0.6;
`;

const Titles = styled.div`
  min-width: 0;
  overflow: hidden;
`;

const Title = styled.div`
  color: var(--color-text);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Artist = styled.div`
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SeeAll = styled(Link)`
  display: inline-block;
  margin-top: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
  text-decoration: none;
  &:hover {
    color: var(--color-text);
    text-decoration: underline;
  }
`;

function RecommendationsWidget() {
  const profile = useAtomValue(profileAtom);
  const { data: tracks } = useTrackRecommendationsQuery(profile?.did);
  const items = (tracks ?? []).slice(0, PREVIEW_COUNT);

  if (items.length === 0) return null;

  return (
    <Container>
      <Header to="/recommendations">
        <IconSparkles size={18} style={{ marginRight: "6px" }} />
        Recommendations
      </Header>
      {items.map((item) => (
        <Item
          key={item.trackUri ?? `${item.title}-${item.artist}`}
          to={uriToPath(item.trackUri) as any}
        >
          {item.albumArt ? (
            <Art src={item.albumArt} alt={item.title} />
          ) : (
            <ArtFallback>♪</ArtFallback>
          )}
          <Titles>
            <Title>{item.title}</Title>
            <Artist>{item.artist}</Artist>
          </Titles>
        </Item>
      ))}
      <SeeAll to="/recommendations">See all</SeeAll>
    </Container>
  );
}

export default RecommendationsWidget;
