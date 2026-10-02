import styled from "@emotion/styled";
import numeral from "numeral";

export type TopShareKind = "artists" | "albums" | "tracks";

export interface TopShareItem {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  plays: number | null;
}

const RANK_COLORS = ["#ff2876", "#a855f7", "#06b6d4"];

const Card = styled.div<{ dark: boolean }>`
  --share-fg: ${({ dark }) => (dark ? "#ffffff" : "#1a0035")};
  --share-muted: ${({ dark }) =>
    dark ? "rgba(255,255,255,0.5)" : "rgba(26,0,53,0.55)"};
  --share-surface: ${({ dark }) =>
    dark ? "rgba(255,255,255,0.06)" : "rgba(26,0,53,0.05)"};
  --share-border: ${({ dark }) =>
    dark ? "rgba(255,255,255,0.08)" : "rgba(26,0,53,0.08)"};

  position: relative;
  width: 600px;
  overflow: hidden;
  box-sizing: border-box;
  padding: 40px;
  background: ${({ dark }) =>
    dark
      ? "linear-gradient(135deg, #0d0020 0%, #1a0035 40%, #0a001a 100%)"
      : "linear-gradient(135deg, #fef3ff 0%, #ffe1ed 40%, #f5f0ff 100%)"};
  color: var(--share-fg);
  font-family: "Space Grotesk", sans-serif;

  p {
    margin: 0;
  }
`;

const Glow = styled.div<{ top?: number; right?: number; bottom?: number; left?: number; color: string }>`
  position: absolute;
  top: ${({ top }) => (top === undefined ? "auto" : `${top}px`)};
  right: ${({ right }) => (right === undefined ? "auto" : `${right}px`)};
  bottom: ${({ bottom }) => (bottom === undefined ? "auto" : `${bottom}px`)};
  left: ${({ left }) => (left === undefined ? "auto" : `${left}px`)};
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: radial-gradient(circle, ${({ color }) => color} 0%, transparent 70%);
`;

const Content = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const Eyebrow = styled.p`
  color: var(--share-muted);
  font-family: "Syne", sans-serif;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const Title = styled.p`
  font-size: 36px;
  font-weight: 900;
  line-height: 1.1;
  color: var(--share-fg);
`;

const Range = styled.p`
  color: var(--share-muted);
  font-family: "Syne", sans-serif;
  font-size: 14px;
  margin-top: 4px !important;
`;

const User = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const Ellipsis = styled.p`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Name = styled(Ellipsis)<{ size?: number }>`
  font-size: ${({ size = 15 }) => size}px;
  font-weight: 700;
`;

const Sub = styled(Ellipsis)<{ size?: number }>`
  font-size: ${({ size = 12 }) => size}px;
  color: var(--share-muted);
`;

const Grow = styled.div`
  flex: 1;
  min-width: 0;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--share-surface);
  border: 1px solid var(--share-border);
`;

const Rank = styled.span<{ index: number }>`
  width: 20px;
  flex-shrink: 0;
  text-align: right;
  font-size: 14px;
  font-weight: 800;
  color: ${({ index }) => RANK_COLORS[index] ?? "var(--share-muted)"};
`;

const Thumb = styled.div<{ round: boolean; size: number }>`
  width: ${({ size }) => size}px;
  height: ${({ size }) => size}px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: ${({ round }) => (round ? "50%" : "8px")};
  background: var(--share-surface);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const CoverTitle = styled(Name)`
  margin-top: 6px !important;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
`;

const Cover = styled.div`
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 10px;
  background: var(--share-surface);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Badge = styled.span<{ index: number }>`
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: ${({ index }) => RANK_COLORS[index] ?? "rgba(0,0,0,0.6)"};
`;

const Plays = styled.span`
  flex-shrink: 0;
  color: var(--share-muted);
  font-size: 12px;
`;

const Footer = styled.p`
  color: var(--share-muted);
  font-family: "Syne", sans-serif;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-align: center;
`;

interface TopShareCardProps {
  cardRef: React.RefObject<HTMLDivElement>;
  kind: TopShareKind;
  title: string;
  rangeLabel: string;
  items: TopShareItem[];
  images: Record<string, string>;
  user: { handle: string; displayName?: string; avatar?: string };
  darkMode: boolean;
}

function TopShareCard({
  cardRef,
  kind,
  title,
  rangeLabel,
  items,
  images,
  user,
  darkMode,
}: TopShareCardProps) {
  const r = (url?: string) => (url ? images[url] : undefined);
  const plays = (n: number | null) => `${numeral(n ?? 0).format("0,0")} plays`;
  const avatar = r(user.avatar);

  return (
    <Card ref={cardRef} dark={darkMode}>
      <Glow top={-80} right={-80} color="rgba(168,85,247,0.35)" />
      <Glow bottom={-80} left={-80} color="rgba(255,40,118,0.3)" />
      <Content>
        <Header>
          <div>
            <Eyebrow>Rocksky</Eyebrow>
            <Title>{title}</Title>
            <Range>{rangeLabel}</Range>
          </div>
          <User>
            {avatar && <Avatar src={avatar} alt="" />}
            <Grow>
              <Name size={14}>{user.displayName || user.handle}</Name>
              <Sub>@{user.handle}</Sub>
            </Grow>
          </User>
        </Header>

        {kind === "albums" ? (
          <Grid>
            {items.map((item, i) => (
              <Grow key={item.id}>
                <Cover>
                  {r(item.image) && <img src={r(item.image)} alt="" />}
                  <Badge index={i}>{i + 1}</Badge>
                </Cover>
                <CoverTitle size={13}>{item.title}</CoverTitle>
                {item.subtitle && <Sub size={11}>{item.subtitle}</Sub>}
                <Sub size={11}>{plays(item.plays)}</Sub>
              </Grow>
            ))}
          </Grid>
        ) : (
          <Rows>
            {items.map((item, i) => (
              <Row key={item.id}>
                <Rank index={i}>{i + 1}</Rank>
                <Thumb round={kind === "artists"} size={44}>
                  {r(item.image) && <img src={r(item.image)} alt="" />}
                </Thumb>
                <Grow>
                  <Name>{item.title}</Name>
                  {item.subtitle && <Sub>{item.subtitle}</Sub>}
                </Grow>
                <Plays>{plays(item.plays)}</Plays>
              </Row>
            ))}
          </Rows>
        )}

        <Footer>rocksky.app</Footer>
      </Content>
    </Card>
  );
}

export default TopShareCard;
