import styled from "@emotion/styled";
import {
  IconBrandSpotify,
  IconDeviceSpeaker,
  IconMusic,
  IconPlayerPause,
} from "@tabler/icons-react";
import { Link as DefaultLink } from "@tanstack/react-router";
import { ProgressBar } from "baseui/progress-bar";
import { useTimeFormat } from "../../hooks/useFormat";
import useUserNowPlaying, {
  SPOTIFY_SOURCE,
} from "../../hooks/useUserNowPlaying";
import { uriToPath } from "../../lib/uri";
import LikeButton from "../LikeButton";
import styles from "./styles";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 20px;
`;

const Row = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
`;

const Cover = styled.img`
  width: 48px;
  height: 48px;
  border-radius: 5px;
  flex-shrink: 0;
`;

const CoverFallback = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 5px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-menu-hover);
  color: var(--color-text-muted);
`;

const Details = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.div`
  font-family: RockfordSansMedium;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  a {
    color: inherit;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const Artist = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  a {
    color: inherit;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const Source = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 16px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Time = styled.span`
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
`;

type NowPlayingBarProps = {
  did?: string;
};

/** The track a profile's owner has on right now — hidden when there is none. */
function NowPlayingBar({ did }: NowPlayingBarProps) {
  const { formatTime } = useTimeFormat();
  const { nowPlaying, progress } = useUserNowPlaying(did);

  if (!nowPlaying?.duration) {
    return null;
  }

  const paused = !nowPlaying.isPlaying;
  const source = [nowPlaying.source, paused ? "Paused" : null]
    .filter(Boolean)
    .join(" · ");

  const cover = nowPlaying.albumArt ? (
    <Cover
      src={nowPlaying.albumArt}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <CoverFallback>
      <IconMusic size={20} />
    </CoverFallback>
  );

  return (
    <Container>
      <Row>
        {nowPlaying.albumUri ? (
          <DefaultLink to={uriToPath(nowPlaying.albumUri)}>{cover}</DefaultLink>
        ) : (
          cover
        )}
        <Details>
          <Title>
            {nowPlaying.songUri ? (
              <DefaultLink to={uriToPath(nowPlaying.songUri)}>
                {nowPlaying.title}
              </DefaultLink>
            ) : (
              nowPlaying.title
            )}
          </Title>
          <Artist>
            {nowPlaying.artistUri?.split("at://")[1] ? (
              <DefaultLink to={uriToPath(nowPlaying.artistUri)}>
                {nowPlaying.artist}
              </DefaultLink>
            ) : (
              nowPlaying.artist
            )}
          </Artist>
          {!!source && (
            <Source>
              {!nowPlaying.source ? (
                <IconPlayerPause size={12} />
              ) : nowPlaying.source === SPOTIFY_SOURCE ? (
                <IconBrandSpotify size={12} />
              ) : (
                <IconDeviceSpeaker size={12} />
              )}
              <span>{source}</span>
            </Source>
          )}
        </Details>
        <LikeButton uri={nowPlaying.songUri} liked={nowPlaying.liked} />
      </Row>
      <Row>
        <Time>{formatTime(progress)}</Time>
        <div className="flex-1">
          <ProgressBar
            value={(progress / nowPlaying.duration) * 100}
            overrides={styles.Progressbar}
          />
        </div>
        <Time>{formatTime(nowPlaying.duration)}</Time>
      </Row>
    </Container>
  );
}

export default NowPlayingBar;
