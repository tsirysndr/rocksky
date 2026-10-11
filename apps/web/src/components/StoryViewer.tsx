import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import SharedStoryViewer from "../../../shared/browser/StoryViewer";
import {
  loadStoryLinks,
  type StoryItem,
} from "../../../shared/browser/storyModel";
import { getSongByUri, getAlbum } from "../api/library";
import { like, unlike, likeTrackById, unlikeTrackById } from "../api/likes";
import { shout } from "../api/shouts";
import { resolveMentionFacets } from "../lib/richtext";
import SignInModal from "./SignInModal";

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
          void queryClient.invalidateQueries({ queryKey: ["stories"] });
        }}
        onPostShout={async (uri, message) => {
          const facets = await resolveMentionFacets(message);
          await shout(
            uri,
            message,
            undefined,
            facets.length ? facets : undefined,
          );
        }}
      />
      <SignInModal isOpen={signIn} onClose={() => setSignIn(false)} />
    </>
  );
}
