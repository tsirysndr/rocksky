import Album from "@/src/components/Album";
import Artist from "@/src/components/Artist";
import ScrollToTopButton from "@/src/components/ScrollToTopButton";
import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import useScrollToTop from "@/src/hooks/useScrollToTop";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { FC } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import SearchInput from "./SearchInput";

export type SearchProps = {
  onSubmit: (query: string) => void;
  results: {
    record: any;
    table: string;
  }[];
  isLoading?: boolean;
  onPressAlbum: (uri: string) => void;
  onPressArtist: (uri: string) => void;
  onPressTrack: (uri: string) => void;
  onPressUser: (handle: string) => void;
};

const Search: FC<SearchProps> = (props) => {
  const {
    results,
    onSubmit,
    isLoading,
    onPressAlbum,
    onPressArtist,
    onPressTrack,
    onPressUser,
  } = props;
  const { scrollToTop, isVisible, fadeAnim, handleScroll, scrollViewRef } =
    useScrollToTop();
  const nowPlaying = useNowPlayingContext();
  const bottomButtonPosition = nowPlaying ? 80 : 20;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="w-full h-full bg-black">
          <SearchInput
            className="mt-[50px] ml-[15px] mr-[15px]"
            onSubmit={onSubmit}
          />
          {isLoading && (
            <View className="w-fullitems-center">
              <ActivityIndicator
                size="large"
                color="#bdbaba"
                className="mt-[50px]"
              />
            </View>
          )}
          {!isLoading && (
            <ScrollView
              ref={scrollViewRef}
              onScroll={handleScroll}
              className="w-full mt-[10px] pl-[15px] pr-[15px]"
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              keyboardShouldPersistTaps="handled"
            >
              {results.map(({ record, table }, index) => {
                switch (table) {
                  case "tracks":
                    return (
                      <Song
                        key={index}
                        image={record.album_art}
                        title={record.title}
                        artist={record.artist}
                        size={60}
                        className="mt-[10px]"
                        onPress={() => onPressTrack(record.uri)}
                        onPressAlbum={() => onPressTrack(record.uri)}
                        did=""
                        albumUri={record.album_uri}
                      />
                    );
                  case "albums":
                    return (
                      <Album
                        key={index}
                        image={record.album_art}
                        title={record.title}
                        artist={record.artist}
                        size={60}
                        className="mt-[10px]"
                        onPress={() => onPressAlbum(record.uri)}
                        did=""
                        row
                      />
                    );
                  case "artists":
                    return (
                      <Artist
                        key={index}
                        image={record.picture}
                        name={record.name}
                        size={60}
                        className="mt-[10px]"
                        onPress={() => onPressArtist(record.uri)}
                        did=""
                        row
                      />
                    );
                  case "users":
                    return (
                      <Artist
                        key={index}
                        image={record.avatar}
                        name={record.display_name}
                        size={60}
                        className="mt-[10px]"
                        onPress={() => onPressUser(record.handle)}
                        did={record.did}
                        row
                      />
                    );
                  default:
                    break;
                }
              })}
            </ScrollView>
          )}
          {isVisible && (
            <ScrollToTopButton
              fadeAnim={fadeAnim}
              bottom={bottomButtonPosition}
              onPress={scrollToTop}
            />
          )}

          <View className="w-full absolute bottom-0 bg-black">
            <StickyPlayer />
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};

export default Search;
