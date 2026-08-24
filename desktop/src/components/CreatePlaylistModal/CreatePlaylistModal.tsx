// The playlist is created on "Next", not at the end: adding a song needs the
// playlist's AT-URI to reference.
import { zodResolver } from "@hookform/resolvers/zod";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useAtom, useSetAtom } from "jotai";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  addSongsTargetAtom,
  createPlaylistModalOpenAtom,
  editingPlaylistAtom,
  newPlaylistSeedSongsAtom,
  pendingPlaylistTracksAtom,
} from "../../atoms/createPlaylist";
import {
  useAddSongsToPlaylistMutation,
  useCreatePlaylistMutation,
  useUpdatePlaylistMutation,
} from "../../hooks/usePlaylists";
import { useSearchMutation } from "../../hooks/useSearch";
import { isTrackHit, type TrackHit } from "../../types/search";
import Track from "../Icons/Track";
import {
  AddButton,
  AddError,
  Button,
  ContextLabel,
  Empty,
  ErrorText,
  EscHint,
  Field,
  FieldLabel,
  Footer,
  FooterActions,
  FootHint,
  Form,
  Header,
  Overlay,
  Panel,
  Primary,
  QueryInput,
  Results,
  Row,
  RowText,
  SearchRow,
  Secondary,
  Subtitle,
  TextArea,
  TextInput,
  Thumb,
  Title,
} from "./styles";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your playlist a name")
    .max(512, "Name is too long"),
  description: z.string().trim().max(256, "Description is too long"),
});

type FormValues = z.infer<typeof schema>;

function DetailsStep({
  editing,
  seedSongUris,
  onCancel,
  onCreated,
  onSaved,
}: {
  editing: { uri: string; name: string; description?: string } | null;
  seedSongUris: string[];
  onCancel: () => void;
  onCreated: (playlist: { uri: string; name: string }) => void;
  onSaved: () => void;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      name: editing?.name ?? "",
      description: editing?.description ?? "",
    },
  });
  const create = useCreatePlaylistMutation();
  const update = useUpdatePlaylistMutation();
  const addSongs = useAddSongsToPlaylistMutation();
  const isPending =
    create.isPending || update.isPending || addSongs.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (editing) {
        await update.mutateAsync({
          uri: editing.uri,
          name: values.name,
          description: values.description || undefined,
        });
        onSaved();
        return;
      }
      const created = await create.mutateAsync({
        name: values.name,
        description: values.description || undefined,
      });
      if (seedSongUris.length > 0) {
        await addSongs.mutateAsync({ uri: created.uri, songs: seedSongUris });
      }
      onCreated({ uri: created.uri, name: values.name });
    } catch {
      setSubmitError(
        editing
          ? "Could not save the playlist. Please try again."
          : "Could not create the playlist. Please try again.",
      );
    }
  });

  return (
    <>
      <Header>
        <div>
          <Title>{editing ? "Edit playlist" : "New playlist"}</Title>
          <Subtitle>
            {editing
              ? "Rename it or change its description."
              : "Name it, then pick the songs."}
          </Subtitle>
        </div>
        <EscHint>esc</EscHint>
      </Header>

      <Form>
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <TextInput
                {...field}
                autoFocus
                placeholder="Late night drive"
                invalid={!!errors.name}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onSubmit();
                  }
                }}
              />
            )}
          />
          {errors.name && <ErrorText>{errors.name.message}</ErrorText>}
        </Field>

        <Field>
          <FieldLabel>Description</FieldLabel>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <TextArea
                {...field}
                placeholder="Optional — what is this playlist for?"
                invalid={!!errors.description}
              />
            )}
          />
          {errors.description && (
            <ErrorText>{errors.description.message}</ErrorText>
          )}
        </Field>

        {submitError && <ErrorText>{submitError}</ErrorText>}
      </Form>

      <Footer>
        <span>Published to your PDS as an app.rocksky.playlist record.</span>
        <FooterActions>
          <Button onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button kind="primary" onClick={onSubmit} disabled={isPending}>
            {isPending
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save"
                : "Next"}
          </Button>
        </FooterActions>
      </Footer>
    </>
  );
}

function SongsStep({ playlist }: { playlist: { uri: string; name: string } }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const { mutate, data, reset } = useSearchMutation();
  const addSongs = useAddSongsToPlaylistMutation();
  const setPendingTracks = useSetAtom(pendingPlaylistTracksAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const debounced = useMemo(
    () => _.debounce((q: string) => mutate(q), 180),
    [mutate],
  );

  useEffect(() => {
    inputRef.current?.focus();
    return () => debounced.cancel();
  }, [debounced]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      debounced.cancel();
      reset();
      return;
    }
    debounced(q);
  }, [query, debounced, reset]);

  // Only songs with an AT-URI can be referenced by a playlist entry.
  const tracks = useMemo(
    () =>
      (data?.hits ?? [])
        .filter(isTrackHit)
        .filter((hit): hit is TrackHit & { uri: string } => !!hit.uri),
    [data],
  );

  const prevTracks = useRef(tracks);
  if (prevTracks.current !== tracks) {
    prevTracks.current = tracks;
    if (active !== 0) setActive(0);
  }

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const add = async (track: TrackHit & { uri: string }) => {
    if (added.has(track.uri) || pending) return;
    setPending(track.uri);
    setAddError(null);
    try {
      await addSongs.mutateAsync({ uri: playlist.uri, songs: [track.uri] });
      setAdded((prev) => new Set(prev).add(track.uri));
      // The AppView won't have the row until jetstream ingests the commit, so
      // hand the playlist page something to show right away.
      setPendingTracks((prev) => ({
        ...prev,
        [playlist.uri]: [
          ...(prev[playlist.uri] ?? []),
          {
            id: track.id,
            title: track.title,
            artist: track.artist,
            albumArtist: track.albumArtist ?? track.artist,
            album: track.album ?? "",
            albumArt: track.albumArt ?? "",
            uri: track.uri,
            duration: 0,
            trackNumber: 0,
            discNumber: 0,
            albumUri: "",
            artistUri: "",
          },
        ],
      }));
    } catch (e) {
      // Without this the failure was invisible: the row simply never flipped to
      // "Added" and nothing said why.
      setAddError(
        e instanceof Error ? e.message : "Could not add that song. Try again.",
      );
    } finally {
      setPending(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (tracks.length ? (i + 1) % tracks.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        tracks.length ? (i - 1 + tracks.length) % tracks.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const track = tracks[active];
      if (track) void add(track);
    }
  };

  const trimmed = query.trim();

  return (
    <>
      <SearchRow>
        <SearchIcon size={22} color="var(--color-text-muted)" />
        <QueryInput
          ref={inputRef}
          value={query}
          placeholder="Search songs by title or artist…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <EscHint>esc</EscHint>
      </SearchRow>

      <ContextLabel>Adding to {playlist.name}</ContextLabel>

      {addError && <AddError>{addError}</AddError>}

      {tracks.length > 0 && (
        <Results>
          {tracks.map((track, idx) => {
            const isAdded = added.has(track.uri);
            return (
              <Row
                key={track.id}
                active={idx === active}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                onMouseMove={() => setActive(idx)}
              >
                <Thumb>
                  {track.albumArt ? (
                    <img src={track.albumArt} alt={track.title} />
                  ) : (
                    <Track color="var(--color-text-muted)" />
                  )}
                </Thumb>
                <RowText>
                  <Primary>{track.title}</Primary>
                  <Secondary>{track.artist}</Secondary>
                </RowText>
                <AddButton
                  added={isAdded}
                  disabled={isAdded || pending === track.uri}
                  onClick={() => void add(track)}
                >
                  {isAdded ? (
                    <>
                      <IconCheck size={14} /> Added
                    </>
                  ) : pending === track.uri ? (
                    "Adding…"
                  ) : (
                    <>
                      <IconPlus size={14} /> Add
                    </>
                  )}
                </AddButton>
              </Row>
            );
          })}
        </Results>
      )}

      {tracks.length === 0 && (
        <Empty>
          {trimmed.length < 2
            ? "Start typing to find songs."
            : `No songs for “${trimmed}”.`}
        </Empty>
      )}

      <Footer hints>
        <FootHint>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </FootHint>
        <FootHint>
          <kbd>↵</kbd> add
        </FootHint>
        <FootHint>
          <kbd>esc</kbd> close
        </FootHint>
      </Footer>
    </>
  );
}

function CreatePlaylistModal() {
  const [open, setOpen] = useAtom(createPlaylistModalOpenAtom);
  const [editing, setEditing] = useAtom(editingPlaylistAtom);
  const [addSongsTarget, setAddSongsTarget] = useAtom(addSongsTargetAtom);
  const [seedSongUris, setSeedSongUris] = useAtom(newPlaylistSeedSongsAtom);
  const [playlist, setPlaylist] = useState<{
    uri: string;
    name: string;
  } | null>(null);

  // Lock background scroll; reset to step 1 on close.
  useEffect(() => {
    if (!open) {
      setPlaylist(null);
      setEditing(null);
      setAddSongsTarget(null);
      setSeedSongUris([]);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, setEditing, setAddSongsTarget, setSeedSongUris]);

  if (!open) return null;

  const close = () => setOpen(false);
  // A target means the playlist already exists — skip the details step.
  const songsFor = playlist ?? addSongsTarget;

  return (
    <Overlay onClick={close}>
      <Panel onClick={(e) => e.stopPropagation()}>
        {songsFor ? (
          <SongsStep playlist={songsFor} />
        ) : (
          <DetailsStep
            editing={editing}
            seedSongUris={seedSongUris}
            onCancel={close}
            onCreated={setPlaylist}
            onSaved={close}
          />
        )}
      </Panel>
    </Overlay>
  );
}

export default CreatePlaylistModal;
