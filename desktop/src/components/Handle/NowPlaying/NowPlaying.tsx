import styled from "@emotion/styled";
import { uriToPath } from "../../../lib/uri";
import { Link as DefaultLink } from "@tanstack/react-router";
import {
  IconBrandSpotify,
  IconDeviceSpeaker,
  IconMusic,
  IconPlayerPause,
} from "@tabler/icons-react";
import { ProgressBar } from "baseui/progress-bar";
import { LabelXSmall } from "baseui/typography";
import { useTimeFormat } from "../../../hooks/useFormat";
import useUserNowPlaying, {
  SPOTIFY_SOURCE,
} from "../../../hooks/useUserNowPlaying";
import styles from "./styles";

const Cover = styled.img`
  width: 54px;
  height: 54px;
  margin-right: 16px;
  border-radius: 5px;
`;

const Link = styled(DefaultLink)`
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Source = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 316px;
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

type NowPlayingProps = {
  did: string;
};

function NowPlaying({ did }: NowPlayingProps) {
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
    <div className="w-[54px] h-[54px] mr-[16px] rounded-[5px] bg-[var(--color-menu-hover)] flex items-center justify-center text-[var(--color-text-muted)]">
      <IconMusic size={20} />
    </div>
  );

  return (
    <>
      <div className="flex flex-row items-center mt-[25px]">
        {nowPlaying.albumUri ? (
          <Link to={uriToPath(nowPlaying.albumUri)}>{cover}</Link>
        ) : (
          cover
        )}
        <div className="max-w-[316px] overflow-hidden">
          <div className="max-w-[316px] overflow-hidden truncate">
            {nowPlaying.songUri && (
              <Link
                to={uriToPath(nowPlaying.songUri)}
                className="font-semibold truncate whitespace-nowrap text-[var(--color-text)]"
              >
                {nowPlaying.title}
              </Link>
            )}
            {!nowPlaying.songUri && (
              <div className="font-semibold truncate whitespace-nowrap text-[var(--color-text)]">
                {nowPlaying.title}
              </div>
            )}
          </div>
          <div className="max-w-[316px] overflow-hidden truncate">
            {!!nowPlaying.artistUri?.split("at://")[1] && (
              <Link
                to={uriToPath(nowPlaying.artistUri)}
                className="text-[var(--color-text-muted)] font-semibold truncate whitespace-nowrap text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {nowPlaying.artist}
              </Link>
            )}
            {!nowPlaying.artistUri?.split("at://")[1] && (
              <div
                className="text-[var(--color-text-muted)] font-semibold truncate whitespace-nowrap text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {nowPlaying.artist}
              </div>
            )}
          </div>
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
        </div>
      </div>
      <div className="mt-[0px] flex flex-row items-center">
        <div>
          <LabelXSmall
            className="!text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {formatTime(progress)}
          </LabelXSmall>
        </div>
        <div className="flex-1 ml-[10px] mr-[10px]">
          <ProgressBar
            value={
              nowPlaying.duration ? (progress / nowPlaying.duration) * 100 : 0
            }
            overrides={styles.Progressbar}
          />
        </div>
        <div>
          <LabelXSmall
            className="!text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {formatTime(nowPlaying.duration)}
          </LabelXSmall>
        </div>
      </div>
    </>
  );
}

export default NowPlaying;
