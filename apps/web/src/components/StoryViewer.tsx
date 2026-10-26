import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import SharedStoryViewer from "../../../shared/browser/StoryViewer";
import {
  loadStoryLinks,
  type StoryItem,
} from "../../../shared/browser/storyModel";
import { getSongByUri, getAlbum } from "../api/library";
import useLike from "../hooks/useLike";
import { shout } from "../api/shouts";
import { resolveMentionFacets } from "../lib/richtext";
import SignInModal from "./SignInModal";
import MediaPicker from "./Shout/MediaPicker";

export default function StoryViewer({
  stories,
  startIndex,
  onClose,
}: {
  stories: StoryItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const [signIn, setSignIn] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { like, unlike, likeTrackById, unlikeTrackById } = useLike();

  return (
    <>
      <SharedStoryViewer
        stories={stories}
        startIndex={startIndex}
        onClose={onClose}
        hidden={signIn}
        onSignIn={() => setSignIn(true)}
        onNavigate={(path) => {
          void navigate({ to: path });
        }}
        loadLinks={(story) =>
          loadStoryLinks(
            story,
            (uri) =>
              queryClient.fetchQuery({
                queryKey: ["story-song", uri],
                queryFn: () => getSongByUri(uri),
                staleTime: 300_000,
              }),
            (did, rkey) =>
              queryClient.fetchQuery({
                queryKey: ["album", did, rkey],
                queryFn: () => getAlbum(did, rkey),
                staleTime: 300_000,
              }),
          )
        }
        onLike={async (story, liked) => {
          if (story.trackUri)
            await (liked ? like(story.trackUri) : unlike(story.trackUri));
          else if (story.trackId)
            await (liked
              ? likeTrackById(story.trackId)
              : unlikeTrackById(story.trackId));
          else throw new Error("Track unavailable");
        }}
        renderMediaPicker={(pickerProps) => <MediaPicker {...pickerProps} />}
        onPostShout={async (uri, message, gif) => {
          const facets = await resolveMentionFacets(message);
          await shout(uri, message, gif, facets.length ? facets : undefined);
        }}
      />
      <SignInModal isOpen={signIn} onClose={() => setSignIn(false)} />
    </>
  );
}
