/* eslint-disable @typescript-eslint/no-explicit-any */
import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { Input } from "baseui/input";
import { PLACEMENT, Popover } from "baseui/popover";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    _.debounce(async (keyword) => {
      const data = await search(keyword);
      setResults(data.records);
    }, 300),
    [search]
  );

  useEffect(() => {
    if (keyword.length === 0) {
      setResults([]);
    } else if (keyword.length > 1) {
      debouncedSearch(keyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  return (
    <>
      <Popover
        isOpen={keyword.length > 0 && Object.keys(errors).length === 0}
        content={
          <div>
            <Header className="text-[var(--color-text)]">
              Search for "{keyword}"
            </Header>
            {results.length > 0 && (
              <div className="p-[16px] overflow-y-auto min-h-[54px] max-h-[70vh]">
                {results.length > 0 && (
                  <>
                    {results.map((item: any) => (
                      <>
                        {item.table === "users" && (
                          <Link
                            to={`/profile/${item.record.handle}`}
                            key={item.record.xata_id}
                          >
                            <div className="flex flex-row mb-[10px]">
                              <img
                                key={item.record.did}
                                src={item.record.avatar}
                                alt={item.record.display_name}
                                className="w-[50px] h-[50px] mr-[12px] rounded-full"
                              />
                              <div>
                                <div className="overflow-hidden">
                                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
                                    {item.record.display_name}
                                  </div>
                                </div>
                                <div className="text-[var(--color-text-muted)] text-[14px]">
                                  @{item.record.handle}
                                </div>
                              </div>
                            </div>
                          </Link>
                        )}

                        {item.record.uri &&
                          (item.record.name || item.record.title) &&
                          item.record.type !== "users" && (
                            <Link
                              to={`/${item.record.uri?.split("at://")[1]}`}
                              key={item.record.xata_id}
                            >
                              <div
                                key={item.record.xata_id}
                                className="h-[64px] flex flex-row items-center"
                              >
                                {item.table === "artists" &&
                                  item.record.picture && (
                                    <img
                                      key={item.record.xata_id}
                                      src={item.record.picture}
                                      alt={item.record.name}
                                      className="w-[50px] h-[50px] mr-[12px] rounded-full"
                                    />
                                  )}
                                {item.table === "artists" &&
                                  !item.record.picture && (
                                    <div
                                      key={item.record.xata_id}
                                      className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]"
                                    >
                                      <div className="w-[28px] h-[28px]">
                                        <Artist color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                {item.table === "albums" &&
                                  item.record.album_art && (
                                    <img
                                      key={item.record.xata_id}
                                      src={item.record.album_art}
                                      alt={item.record.title}
                                      className="w-[50px] h-[50px] mr-[12px]"
                                    />
                                  )}
                                {item.table === "albums" &&
                                  !item.record.album_art && (
                                    <div className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]">
                                      <div className="w-[28px] h-[28px]">
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
                                      key={item.record.xata_id}
                                      src={item.record.album_art}
                                      alt={item.record.title}
                                      className="w-[50px] h-[50px] mr-[12px]"
                                    />
                                  )}
                                {item.table === "tracks" &&
                                  !item.record.album_art && (
                                    <div className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]">
                                      <div className="w-[28px] h-[28px]">
                                        <Track color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                <div className="overflow-hidden w-[calc(100%-70px)]">
                                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
                                    {item.record.name || item.record.title}
                                  </div>
                                  {item.table === "tracks" && (
                                    <div className="text-[14px] text-[var(--color-text-muted)]">
                                      Track
                                    </div>
                                  )}
                                  {item.table === "albums" && (
                                    <div className="text-[14px] text-[var(--color-text-muted)]">
                                      Album
                                    </div>
                                  )}
                                  {item.table === "artists" && (
                                    <div className="text-[var(--color-text-muted)] text-[14px]">
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
                                className="h-[64px] flex flex-row items-center"
                              >
                                {item.table === "artists" &&
                                  item.record.picture && (
                                    <img
                                      src={item.record.picture}
                                      alt={item.record.name}
                                      className="w-[50px] h-[50px] mr-[12px] rounded-full"
                                    />
                                  )}
                                {item.table === "artists" &&
                                  !item.record.picture && (
                                    <div className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]">
                                      <div className="w-[28px] h-[28px]">
                                        <Artist color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                {item.table === "albums" &&
                                  item.record.album_art && (
                                    <img
                                      src={item.record.album_art}
                                      alt={item.record.title}
                                      className="w-[50px] h-[50px] mr-[12px]"
                                    />
                                  )}
                                {item.table === "tracks" && (
                                  <img
                                    src={item.record.album_art}
                                    alt={item.record.title}
                                    className="w-[50px] h-[50px] mr-[12px]"
                                  />
                                )}
                                {["artists", "albums", "tracks"].includes(
                                  item.table
                                ) && (
                                  <div className="overflow-hidden">
                                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
                                      {item.record.name || item.record.title}
                                    </div>
                                    {item.table === "tracks" && (
                                      <div className="text-[14px] text-[var(--color-text-muted)]">
                                        Track
                                      </div>
                                    )}
                                    {item.table === "albums" && (
                                      <div className="text-[14px] text-[var(--color-text-muted)]">
                                        Album
                                      </div>
                                    )}
                                    {item.table === "artists" && (
                                      <div className="text-[14px] text-[var(--color-text-muted)]">
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
              backgroundColor: "var(--color-background)",
              width: "300px",
              border: "0.5px solid var(--color-border) !important",
            },
          },
          Inner: {
            style: {
              backgroundColor: "var(--color-background)",
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
                startEnhancer={
                  <SearchIcon size={20} color="var(--color-text-muted)" />
                }
                placeholder="Search"
                clearable
                clearOnEscape
                overrides={{
                  Root: {
                    style: {
                      backgroundColor: "var(--color-input-background)",
                      borderColor: "var(--color-input-background)",
                    },
                  },
                  StartEnhancer: {
                    style: {
                      backgroundColor: "var(--color-input-background)",
                    },
                  },
                  InputContainer: {
                    style: {
                      backgroundColor: "var(--color-input-background)",
                    },
                  },
                  Input: {
                    style: {
                      color: "var(--color-text)",
                      caretColor: "var(--color-text)",
                    },
                  },
                  ClearIcon: {
                    style: {
                      color: "var(--color-clear-input) !important",
                    },
                  },
                }}
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
