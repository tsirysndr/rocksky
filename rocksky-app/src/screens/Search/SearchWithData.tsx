import { useSearchMutation } from "@/src/hooks/useSearch";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import _ from "lodash";
import * as R from "ramda";
import { useEffect, useState } from "react";
import Search from "./Search";

const SearchWithData = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [results, setResults] = useState<
    {
      record: any;
      table: string;
    }[]
  >([]);
  const { mutate, data, isPending } = useSearchMutation();

  const handleSearch = (query: string) => {
    if (query.length < 3) {
      setResults([]);
      return;
    }

    if (query.length < 3) {
      return;
    }

    _.debounce(() => {
      mutate(query);
    }, 500)();
  };

  useEffect(() => {
    if (!data) return;

    setResults(
      R.pipe(
        R.prop("records"),
        R.sort(R.descend((item) => R.path(["record", "xata_score"], item) ?? 0))
      )(data) as {
        record: any;
        table: string;
      }[]
    );
  }, [data]);

  return (
    <Search
      onSubmit={handleSearch}
      results={results}
      isLoading={isPending}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
      onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onPressUser={(handle) => navigation.navigate("UserProfile", { handle })}
    />
  );
};

export default SearchWithData;
