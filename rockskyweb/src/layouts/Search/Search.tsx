/* eslint-disable @typescript-eslint/no-explicit-any */
import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { Input } from "baseui/input";
import { PLACEMENT, Popover } from "baseui/popover";
import _ from "lodash";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link as DefaultLink } from "react-router";
import z from "zod";
import Artist from "../../components/Icons/Artist";
import Disc from "../../components/Icons/Disc";
import Track from "../../components/Icons/Track";
import useSearch from "../../hooks/useSearch";

const Link = styled(DefaultLink)`
  color: initial;
  text-decoration: none;
`;

const Header = styled.div`
  padding: 16px;
`;

const schema = z.object({
  keyword: z.string().nonempty(),
});

function Search() {
  const [results, setResults] = useState([]);

  const { search } = useSearch();
  const {
    control,
    formState: { errors },
    watch,
  } = useForm({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: {
      keyword: "",
    },
  });

  const keyword = watch("keyword");

  useEffect(() => {
    if (keyword.length === 0) {
      setResults([]);
    }

    if (keyword.length > 1) {
      const _search = async () => {
        const data = await search(keyword);
        setResults(data.records);
      };

      // debounce
      _.debounce(_search, 200)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  return (
    <>
      <Popover
        isOpen={keyword.length > 0 && Object.keys(errors).length === 0}
        content={
          <div>
            <Header>Search for "{keyword}"</Header>
            {results.length > 0 && (
              <div
                style={{
                  padding: "16px",
                  overflowY: "auto",
                  minHeight: "54px",
                  maxHeight: "70vh",
                }}
              >
                {results.length > 0 && (
                  <>
                    {results.map((item: any) => (
                      <>
                        {item.table === "users" && (
                          <Link to={`/profile/${item.record.handle}`}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "row",
                              }}
                            >
                              <img
                                src={item.record.avatar}
                                alt={item.record.display_name}
                                style={{
                                  width: 50,
                                  height: 50,
                                  marginRight: 12,
                                  borderRadius: 25,
                                }}
                              />
                              <div>
                                <div
                                  style={{
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {item.record.display_name}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    fontFamily: "RockfordSansLight",
                                    color: "rgba(36, 49, 61, 0.65)",
                                    fontSize: 14,
                                  }}
                                >
                                  @{item.record.handle}
                                </div>
                              </div>
                            </div>
                          </Link>
                        )}

                        {item.record.uri &&
                          (item.record.name || item.record.title) &&
                          item.record.type !== "users" && (
                            <Link to={`/${item.record.uri?.split("at://")[1]}`}>
                              <div
                                key={item.id}
                                style={{
                                  height: 64,
                                  display: "flex",
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                {item.table === "artists" &&
                                  item.record.picture && (
                                    <img
                                      src={item.record.picture}
                                      alt={item.record.name}
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                        borderRadius: 25,
                                      }}
                                    />
                                  )}
                                {item.table === "artists" &&
                                  !item.record.picture && (
                                    <div
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                        borderRadius: 30,
                                        backgroundColor:
                                          "rgba(243, 243, 243, 0.725)",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: 28,
                                          width: 28,
                                        }}
                                      >
                                        <Artist color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                {item.table === "albums" &&
                                  item.record.album_art && (
                                    <img
                                      src={item.record.album_art}
                                      alt={item.record.title}
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                      }}
                                    />
                                  )}
                                {item.table === "albums" &&
                                  !item.record.album_art && (
                                    <div
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                        backgroundColor:
                                          "rgba(243, 243, 243, 0.725)",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: 28,
                                          width: 28,
                                        }}
                                      >
                                        <Disc
                                          color="rgba(66, 87, 108, 0.65)"
                                          width={30}
                                          height={30}
                                        />
                                      </div>
                                    </div>
                                  )}
                                {item.table === "tracks" &&
                                  item.record.album_art && (
                                    <img
                                      src={item.record.album_art}
                                      alt={item.record.title}
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                      }}
                                    />
                                  )}
                                {item.table === "tracks" &&
                                  !item.record.album_art && (
                                    <div
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                        backgroundColor:
                                          "rgba(243, 243, 243, 0.725)",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: 28,
                                          width: 28,
                                        }}
                                      >
                                        <Track color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                <div
                                  style={{
                                    overflow: "hidden",
                                    width: "calc(100% - 70px)",
                                  }}
                                >
                                  <div
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {item.record.name || item.record.title}
                                  </div>
                                  {item.table === "tracks" && (
                                    <div
                                      style={{
                                        fontFamily: "RockfordSansLight",
                                        color: "rgba(36, 49, 61, 0.65)",
                                        fontSize: 14,
                                      }}
                                    >
                                      Track
                                    </div>
                                  )}
                                  {item.table === "albums" && (
                                    <div
                                      style={{
                                        fontFamily: "RockfordSansLight",
                                        color: "rgba(36, 49, 61, 0.65)",
                                        fontSize: 14,
                                      }}
                                    >
                                      Album
                                    </div>
                                  )}
                                  {item.table === "artists" && (
                                    <div
                                      style={{
                                        fontFamily: "RockfordSansLight",
                                        color: "rgba(36, 49, 61, 0.65)",
                                        fontSize: 14,
                                      }}
                                    >
                                      Artist
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Link>
                          )}
                        {!item.record.uri &&
                          (item.record.name || item.record.title) &&
                          item.tables !== "users" && (
                            <div>
                              <div
                                key={item.id}
                                style={{
                                  height: 64,
                                  display: "flex",
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                {item.table === "artists" &&
                                  item.record.picture && (
                                    <img
                                      src={item.record.picture}
                                      alt={item.record.name}
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                        borderRadius: 25,
                                      }}
                                    />
                                  )}
                                {item.table === "artists" &&
                                  !item.record.picture && (
                                    <div
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                        borderRadius: 30,
                                        backgroundColor:
                                          "rgba(243, 243, 243, 0.725)",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: 28,
                                          width: 28,
                                        }}
                                      >
                                        <Artist color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                {item.table === "albums" &&
                                  item.record.album_art && (
                                    <img
                                      src={item.record.album_art}
                                      alt={item.record.title}
                                      style={{
                                        width: 50,
                                        height: 50,
                                        marginRight: 12,
                                      }}
                                    />
                                  )}
                                {item.table === "tracks" && (
                                  <img
                                    src={item.record.album_art}
                                    alt={item.record.title}
                                    style={{
                                      width: 50,
                                      height: 50,
                                      marginRight: 12,
                                    }}
                                  />
                                )}
                                {["artists", "albums", "tracks"].includes(
                                  item.table
                                ) && (
                                  <div style={{ overflow: "hidden" }}>
                                    <div
                                      style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {item.record.name || item.record.title}
                                    </div>
                                    {item.table === "tracks" && (
                                      <div
                                        style={{
                                          fontFamily: "RockfordSansLight",
                                          color: "rgba(36, 49, 61, 0.65)",
                                          fontSize: 14,
                                        }}
                                      >
                                        Track
                                      </div>
                                    )}
                                    {item.table === "albums" && (
                                      <div
                                        style={{
                                          fontFamily: "RockfordSansLight",
                                          color: "rgba(36, 49, 61, 0.65)",
                                          fontSize: 14,
                                        }}
                                      >
                                        Album
                                      </div>
                                    )}
                                    {item.table === "artists" && (
                                      <div
                                        style={{
                                          fontFamily: "RockfordSansLight",
                                          color: "rgba(36, 49, 61, 0.65)",
                                          fontSize: 14,
                                        }}
                                      >
                                        Artist
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                      </>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        }
        placement={PLACEMENT.bottom}
        overrides={{
          Body: {
            style: {
              backgroundColor: "#fff",
              width: "300px",
            },
          },
          Inner: {
            style: {
              backgroundColor: "#fff",
            },
          },
        }}
      >
        <div>
          <Controller
            name="keyword"
            control={control}
            render={({ field }) => (
              <Input
                startEnhancer={<SearchIcon size={20} color="#42576ca6" />}
                placeholder="Search"
                clearable
                clearOnEscape
                {...field}
              />
            )}
          />
        </div>
      </Popover>
    </>
  );
}

export default Search;
