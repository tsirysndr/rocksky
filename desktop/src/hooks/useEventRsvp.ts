import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { putEventRsvp } from "../api/events";
import type { ArtistEvent, RsvpStatus } from "../types/event";

export function useEventRsvp(uri: string) {
  const client = useQueryClient();
  const viewer = localStorage.getItem("did");
  const filter = {
    queryKey: ["artistEvents"],
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[2] === viewer,
  };
  return useMutation({
    mutationFn: (status: RsvpStatus) => putEventRsvp(uri, status),
    scope: { id: `eventRsvp:${viewer}:${uri}` },
    onMutate: () => client.cancelQueries(filter),
    onSuccess: (result) => {
      client.setQueriesData<InfiniteData<ArtistEvent[]>>(
        filter,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) =>
              page.map((event) =>
                event.uri === uri
                  ? { ...event, viewerRsvp: result.status }
                  : event,
              ),
            ),
          },
      );
      void client.invalidateQueries(filter);
    },
  });
}
