/* eslint-disable @typescript-eslint/no-explicit-any */
import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { Link as DefaultLink } from "@tanstack/react-router";
import { Input } from "baseui/input";
import { PLACEMENT, Popover } from "baseui/popover";
import _ from "lodash";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";
import Artist from "../../components/Icons/Artist";
import Disc from "../../components/Icons/Disc";
import Track from "../../components/Icons/Track";
import { useSearchMutation } from "../../hooks/useSearch";
import { IconUser } from "@tabler/icons-react";

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
  const [results, setResults] = useState<any[]>([]);
  const { mutate, data } = useSearchMutation();

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

  const debouncedSearch = _.debounce(async (keyword) => {
    mutate(keyword);
  }, 200);

  useEffect(() => {
    if (keyword.length === 0) {
      setResults([]);
    } else if (keyword.length > 1) {
      debouncedSearch(keyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  useEffect(() => {
    if (data && data.hits) {
      setResults(data.hits);
    } else {
      setResults([]);
    }
  }, [data]);

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
              <div className="p-[16px] overflow-y-auto min-h-[54px] !max-h-[400px]">
                {results.length > 0 && (
                  <>
                    {results.map((item: any) => (
                      <>
                        {item._federation.indexUid === "users" && (
                          <Link to={`/profile/${item.handle}`} key={item.id}>
                            <div className="flex flex-row mb-[10px]">
                              {!item.avatar?.endsWith("/@jpeg") && (
                                <img
                                  key={item.did}
                                  src={item.avatar}
                                  alt={item.displayName}
                                  className="w-[50px] h-[50px] mr-[12px] rounded-full"
                                />
                              )}
                              {item.avatar?.endsWith("/@jpeg") && (
                                <div className="w-[50px] h-[50px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center mr-[12px]">
                                  <IconUser size={25} color="#fff" />
                                </div>
                              )}
                              <div>
                                <div className="overflow-hidden">
                                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
                                    {item.displayName}
                                  </div>
                                </div>
                                <div className="text-[var(--color-text-muted)] text-[14px]">
                                  @{item.handle}
                                </div>
                              </div>
                            </div>
                          </Link>
                        )}

                        {item.uri &&
                          (item.name || item.title) &&
                          item._federation.indexUid !== "users" && (
                            <Link
                              to={`/${item.uri
                                ?.split("at://")[1]
                                .replace("app.rocksky.", "")}`}
                              key={item.id}
                            >
                              <div
                                key={item.id}
                                className="h-[64px] flex flex-row items-center"
                              >
                                {item._federation.indexUid === "artists" &&
                                  item.picture && (
                                    <img
                                      key={item.id}
                                      src={item.picture}
                                      alt={item.name}
                                      className="w-[50px] h-[50px] mr-[12px] rounded-full"
                                    />
                                  )}
                                {item._federation.indexUid === "artists" &&
                                  !item.picture && (
                                    <div
                                      key={item.id}
                                      className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]"
                                    >
                                      <div className="w-[28px] h-[28px]">
                                        <Artist color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                {item._federation.indexUid === "albums" &&
                                  item.albumArt && (
                                    <img
                                      key={item.id}
                                      src={item.albumArt}
                                      alt={item.title}
                                      className="w-[50px] h-[50px] mr-[12px]"
                                    />
                                  )}
                                {item._federation.indexUid === "albums" &&
                                  !item.albumArt && (
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
                                {item._federation.indexUid === "tracks" &&
                                  item.albumArt && (
                                    <img
                                      key={item.id}
                                      src={item.albumArt}
                                      alt={item.title}
                                      className="w-[50px] h-[50px] mr-[12px]"
                                    />
                                  )}
                                {item._federation.indexUid === "tracks" &&
                                  !item.albumArt && (
                                    <div className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]">
                                      <div className="w-[28px] h-[28px]">
                                        <Track color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                <div className="overflow-hidden w-[calc(100%-70px)]">
                                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
                                    {item.name || item.title}
                                  </div>
                                  {item._federation.indexUid === "tracks" && (
                                    <div className="text-[14px] text-[var(--color-text-muted)]">
                                      Track
                                    </div>
                                  )}
                                  {item._federation.indexUid === "albums" && (
                                    <div className="text-[14px] text-[var(--color-text-muted)]">
                                      Album
                                    </div>
                                  )}
                                  {item._federation.indexUid === "artists" && (
                                    <div className="text-[var(--color-text-muted)] text-[14px]">
                                      Artist
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Link>
                          )}
                        {!item.uri &&
                          (item.name || item.title) &&
                          item._federation.indexUid !== "users" && (
                            <div>
                              <div
                                key={item.id}
                                className="h-[64px] flex flex-row items-center"
                              >
                                {item._federation.indexUid === "artists" &&
                                  item.picture && (
                                    <img
                                      src={item.picture}
                                      alt={item.name}
                                      className="w-[50px] h-[50px] mr-[12px] rounded-full"
                                    />
                                  )}
                                {item._federation.indexUid === "artists" &&
                                  !item.picture && (
                                    <div className="w-[50px] h-[50px] mr-[12px] rounded-full flex items-center bg-[rgba(243, 243, 243, 0.725)]">
                                      <div className="w-[28px] h-[28px]">
                                        <Artist color="rgba(66, 87, 108, 0.65)" />
                                      </div>
                                    </div>
                                  )}
                                {item._federation.indexUid === "albums" &&
                                  item.albumArt && (
                                    <img
                                      src={item.albumArt}
                                      alt={item.title}
                                      className="w-[50px] h-[50px] mr-[12px]"
                                    />
                                  )}
                                {item._federation.indexUid === "tracks" && (
                                  <img
                                    src={item.albumArt}
                                    alt={item.title}
                                    className="w-[50px] h-[50px] mr-[12px]"
                                  />
                                )}
                                {["artists", "albums", "tracks"].includes(
                                  item._federation.indexUid,
                                ) && (
                                  <div className="overflow-hidden">
                                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
                                      {item.name || item.title}
                                    </div>
                                    {item._federation.indexUid === "tracks" && (
                                      <div className="text-[14px] text-[var(--color-text-muted)]">
                                        Track
                                      </div>
                                    )}
                                    {item._federation.indexUid === "albums" && (
                                      <div className="text-[14px] text-[var(--color-text-muted)]">
                                        Album
                                      </div>
                                    )}
                                    {item._federation.indexUid ===
                                      "artists" && (
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
        popperOptions={{
          modifiers: {
            flip: { enabled: false },
            preventOverflow: { enabled: true },
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
