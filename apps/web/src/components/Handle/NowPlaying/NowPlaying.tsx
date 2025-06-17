import styled from "@emotion/styled";
import axios from "axios";
import { ProgressBar } from "baseui/progress-bar";
import { LabelXSmall } from "baseui/typography";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef } from "react";
import { Link as DefaultLink } from "react-router";
import { playerAtom } from "../../../atoms/player";
import { userNowPlayingAtom } from "../../../atoms/userNowplaying";
import { API_URL } from "../../../consts";
import { useTimeFormat } from "../../../hooks/useFormat";
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

type NowPlayingProps = {
  did: string;
};

function NowPlaying({ did }: NowPlayingProps) {
  const { formatTime } = useTimeFormat();
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);
  const nowPlayingInterval = useRef<number | null>(null);
  const [nowPlaying, setNowPlaying] = useAtom(userNowPlayingAtom);
  const player = useAtomValue(playerAtom);

  const fetchCurrentlyPlaying = useCallback(async () => {
    if (player === "rockbox" || player === null) {
      const [rockbox, spotify] = await Promise.all([
        axios.get(`${API_URL}/now-playing`, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          params: {
            did,
          },
        }),
        axios.get(`${API_URL}/spotify/currently-playing`, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          params: {
            did,
          },
        }),
      ]);

      if (rockbox.data.title) {
        setNowPlaying({
          ...nowPlaying,
          [did]: {
            title: rockbox.data.title,
            artist: rockbox.data.album_artist || rockbox.data.artist,
            artistUri: rockbox.data.artist_uri,
            songUri: rockbox.data.song_uri,
            albumUri: rockbox.data.album_uri,
            duration: rockbox.data.length,
            progress: rockbox.data.elapsed,
            albumArt: _.get(rockbox.data, "album_art"),
            isPlaying: rockbox.data.is_playing,
          },
        });
      } else {
        if (!spotify.data.item) {
          setNowPlaying({
            ...nowPlaying,
            [did]: null,
          });
        }
      }

      if (rockbox.data.title) {
        return;
      }
    }
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: {
        authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      params: {
        did,
      },
    });
    if (data.item) {
      setNowPlaying({
        ...nowPlaying,
        [did]: {
          title: data.item.name,
          artist: data.item.artists[0].name,
          artistUri: data.artistUri,
          songUri: data.songUri,
          albumUri: data.albumUri,
          duration: data.item.duration_ms,
          progress: data.progress_ms,
          albumArt: _.get(data, "item.album.images.0.url"),
          isPlaying: data.is_playing,
        },
      });
    } else {
      setNowPlaying({
        ...nowPlaying,
        [did]: null,
      });
    }
    lastFetchedRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying, did, player]);

  const startProgressTracking = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    progressInterval.current = setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev[did] || !prev[did].duration) {
          return prev;
        }

        if (prev[did].progress >= prev[did].duration) {
          setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }

        if (prev[did].isPlaying) {
          const progress = prev[did].progress + 100;
          return {
            ...prev,
            [did]: {
              ...prev[did],
              progress,
            },
          };
        }

        return prev;
      });
    }, 100);
  }, [fetchCurrentlyPlaying, setNowPlaying, did]);

  useEffect(() => {
    startProgressTracking();

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nowPlayingInterval.current) {
      clearInterval(nowPlayingInterval.current);
    }
    nowPlayingInterval.current = setInterval(() => {
      fetchCurrentlyPlaying();
    }, 15000);

    fetchCurrentlyPlaying();

    return () => {
      if (nowPlayingInterval.current) {
        clearInterval(nowPlayingInterval.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!!nowPlaying[did]?.duration && (
        <>
          <div className="flex flex-row items-center mt-[25px]">
            {!!nowPlaying[did]?.albumUri && (
              <Link to={`/${nowPlaying[did]?.albumUri?.split("at://")[1]}`}>
                <Cover src={nowPlaying[did]?.albumArt} />
              </Link>
            )}
            {!nowPlaying[did]?.albumUri && (
              <Cover src={nowPlaying[did]?.albumArt} />
            )}
            <div className="max-w-[316px] overflow-hidden">
              <div className="max-w-[316px] overflow-hidden truncate">
                {nowPlaying[did]?.songUri && (
                  <Link
                    to={`/${nowPlaying[did]?.songUri?.split("at://")[1]}`}
                    className="font-semibold truncate whitespace-nowrap text-[var(--color-text)]"
                  >
                    {nowPlaying[did]?.title}
                  </Link>
                )}
                {!nowPlaying[did]?.songUri && (
                  <div className="font-semibold truncate whitespace-nowrap text-[var(--color-text)]">
                    {nowPlaying[did]?.title}
                  </div>
                )}
              </div>
              <div className="max-w-[316px] overflow-hidden truncate">
                {!!nowPlaying[did]?.artistUri?.split("at://")[1] && (
                  <Link
                    to={`/${nowPlaying[did]?.artistUri?.split("at://")[1]}`}
                    className="text-[var(--color-text-muted)] font-semibold truncate whitespace-nowrap text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {nowPlaying[did]?.artist}
                  </Link>
                )}
                {!nowPlaying[did]?.artistUri?.split("at://")[1] && (
                  <div
                    className="text-[var(--color-text-muted)] font-semibold truncate whitespace-nowrap text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {nowPlaying[did]?.artist}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-[0px] flex flex-row items-center">
            <div>
              <LabelXSmall className="!text-[var(--color-text-muted)]">
                {formatTime(nowPlaying[did]?.progress || 0)}
              </LabelXSmall>
            </div>
            <div className="flex-1 ml-[10px] mr-[10px]">
              <ProgressBar
                value={
                  nowPlaying[did]?.progress && nowPlaying[did]?.duration
                    ? (nowPlaying[did].progress / nowPlaying[did].duration) *
                      100
                    : 0
                }
                overrides={styles.Progressbar}
              />
            </div>
            <div>
              <LabelXSmall className="!text-[var(--color-text-muted)]">
                {formatTime(nowPlaying[did]?.duration || 0)}
              </LabelXSmall>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default NowPlaying;
