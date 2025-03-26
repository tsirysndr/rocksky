import styled from "@emotion/styled";
import axios from "axios";
import { ProgressBar } from "baseui/progress-bar";
import { LabelXSmall } from "baseui/typography";
import { useAtom } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef } from "react";
import { Link as DefaultLink } from "react-router";
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
  color: inherit;
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

  const fetchCurrentlyPlaying = useCallback(async () => {
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
  }, [setNowPlaying, did]);

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
  }, [fetchCurrentlyPlaying, setNowPlaying]);

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
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginTop: 25,
            }}
          >
            {!!nowPlaying[did]?.albumUri && (
              <Link to={`/${nowPlaying[did]?.albumUri?.split("at://")[1]}`}>
                <Cover src={nowPlaying[did]?.albumArt} />
              </Link>
            )}
            {!nowPlaying[did]?.albumUri && (
              <Cover src={nowPlaying[did]?.albumArt} />
            )}
            <div
              style={{
                maxWidth: "calc(340px - 54px + 30px)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  maxWidth: "calc(340px - 54px + 30px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <Link
                  to={`/${nowPlaying[did]?.songUri?.split("at://")[1]}`}
                  style={{
                    fontWeight: 600,
                    textOverflow: "ellipsis",
                    textWrap: "nowrap",
                  }}
                >
                  {nowPlaying[did]?.title}
                </Link>
              </div>
              <div
                style={{
                  maxWidth: "calc(340px - 54px + 30px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <Link
                  to={`/${nowPlaying[did]?.artistUri?.split("at://")[1]}`}
                  style={{
                    fontFamily: "RockfordSansLight",
                    color: "rgba(36, 49, 61, 0.65)",
                    fontWeight: 600,
                    textOverflow: "ellipsis",
                    textWrap: "nowrap",
                    fontSize: "14px",
                  }}
                >
                  {nowPlaying[did]?.artist}
                </Link>
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 0,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <div>
              <LabelXSmall color={"rgba(36, 49, 61, 0.65)"}>
                {formatTime(nowPlaying[did]?.progress || 0)}
              </LabelXSmall>
            </div>
            <div style={{ flex: 1, marginLeft: 10, marginRight: 10 }}>
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
              <LabelXSmall color={"rgba(36, 49, 61, 0.65)"}>
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
