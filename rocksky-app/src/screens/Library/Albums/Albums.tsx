import Album from "@/src/components/Album";
import numeral from "numeral";
import { FC } from "react";
import { Text, View } from "react-native";

export type AlbumsProps = {
  albums: {
    artist: string;
    title: string;
    cover: string;
    uri: string;
  }[];
  total: number;
  onPressAlbum: (uri: string) => void;
};

const Albums: FC<AlbumsProps> = (props) => {
  const { albums, total, onPressAlbum } = props;
  return (
    <>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
        ALBUMS SCROBBLED
      </Text>
      <Text className="font-rockford-regular text-white text-[18px]">
        {numeral(total).format("0,0")}
      </Text>
      <View className="mt-[20px] mb-[100px]">
        {albums.map((album, index) => (
          <Album
            key={index}
            artist={album.artist}
            title={album.title}
            image={album.cover}
            onPress={onPressAlbum}
            did={album.uri}
            row={true}
            size={60}
            className="mb-[15px] items-center"
            rank={index + 1}
          />
        ))}
      </View>
    </>
  );
};

export default Albums;
