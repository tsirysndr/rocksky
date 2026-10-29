import AlbumArt from "../../components/AlbumArt";
import { useNavidromeAlbumQuery } from "../../hooks/useNavidrome";

/** Older search responses contain a cover ID but no public artwork URL. */
export default function CoverFlowArtwork({
  src,
  albumId,
}: {
  src?: string | null;
  albumId?: string;
}) {
  // Only visible covers resolve details; React Query shares and caches the lookup.
  const details = useNavidromeAlbumQuery(src ? "" : (albumId ?? ""));
  const artwork =
    src || details.data?.coverArtUrl || details.data?._coverArtUrl;
  return (
    <>
      <AlbumArt src={artwork} alt="" draggable={false} />
      <AlbumArt
        className="reflection"
        src={artwork}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </>
  );
}
