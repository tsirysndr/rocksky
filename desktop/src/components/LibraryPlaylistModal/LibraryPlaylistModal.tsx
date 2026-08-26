// The navidrome-backed twin of CreatePlaylistModal: same two steps, same
// chrome (both import components/CreatePlaylistModal/styles), but the songs
// step searches only the user's own uploads instead of the global catalogue.
//
// Unlike its ATProto sibling the playlist is created on "Next" for a plainer
// reason: adding a song needs the navidrome playlist id.
import { zodResolver } from "@hookform/resolvers/zod";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { coverArtUrlOf, type NavidromeSong } from "../../api/navidrome";
import {
  addLibrarySongsTargetAtom,
  editingLibraryPlaylistAtom,
  libraryPlaylistModalOpenAtom,
  newLibraryPlaylistSeedSongsAtom,
} from "../../atoms/libraryPlaylist";
import {
  useAddTrackToPlaylistMutation,
  useCreatePlaylistMutation,
  useNavidromeCredentials,
  useNavidromeSongSearchQuery,
  useRenamePlaylistMutation,
} from "../../hooks/useNavidrome";
import {
  AddButton,
  AddError,
  Button,
  ContextLabel,
  DESCRIPTION_MAX,
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
  NAME_MAX,
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
} from "../CreatePlaylistModal/styles";
import Track from "../Icons/Track";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your playlist a name")
    .max(NAME_MAX, "Name is too long"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "Description is too long"),
});

type FormValues = z.infer<typeof schema>;

type PlaylistTarget = { id: string; name: string };

function DetailsStep({
  editing,
  seedSongIds,
  onCancel,
  onCreated,
  onSaved,
}: {
  editing: { id: string; name: string; description?: string } | null;
  seedSongIds: string[];
  onCancel: () => void;
  onCreated: (playlist: PlaylistTarget) => void;
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
  const rename = useRenamePlaylistMutation();
  const isPending = create.isPending || rename.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (editing) {
        await rename.mutateAsync({
          id: editing.id,
          name: values.name,
          description: values.description,
        });
        onSaved();
        return;
      }
      const id = await create.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        songIds: seedSongIds,
      });
      if (!id) throw new Error("navidrome returned no playlist id");
      onCreated({ id, name: values.name });
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? e.message
          : editing
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
              : "Name it, then pick songs from your library."}
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
        <span>Saved to your library and mirrored to your PDS.</span>
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

function SongsStep({ playlist }: { playlist: PlaylistTarget }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const { data: creds } = useNavidromeCredentials();
  const addTrack = useAddTrackToPlaylistMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: songs = [] } = useNavidromeSongSearchQuery(debouncedQuery);

  const prevSongs = useRef(songs);
  if (prevSongs.current !== songs) {
    prevSongs.current = songs;
    if (active !== 0) setActive(0);
  }

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // A song may legitimately be added twice, so this tracks how many times each
  // one has been — the button reads "Added" but stays clickable.
  const addedCount = (songId: string) =>
    added.filter((id) => id === songId).length;

  const add = async (song: NavidromeSong) => {
    if (pending) return;
    setPending(song.id);
    setAddError(null);
    try {
      await addTrack.mutateAsync({ playlistId: playlist.id, songId: song.id });
      setAdded((prev) => [...prev, song.id]);
    } catch (e) {
      // Includes the mirror warning: the song is in the library playlist but
      // its record didn't reach the PDS. Saying so beats a row that silently
      // never flips to "Added".
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
      setActive((i) => (songs.length ? (i + 1) % songs.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        songs.length ? (i - 1 + songs.length) % songs.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const song = songs[active];
      if (song) void add(song);
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
          placeholder="Search your library by title or artist…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <EscHint>esc</EscHint>
      </SearchRow>

      <ContextLabel>Adding to {playlist.name}</ContextLabel>

      {addError && <AddError>{addError}</AddError>}

      {songs.length > 0 && (
        <Results>
          {songs.map((song, idx) => {
            const count = addedCount(song.id);
            const albumArt =
              creds && song.coverArt
                ? coverArtUrlOf(song)
                : null;
            return (
              <Row
                key={song.id}
                active={idx === active}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                onMouseMove={() => setActive(idx)}
              >
                <Thumb>
                  {albumArt ? (
                    <img src={albumArt} alt={song.title} />
                  ) : (
                    <Track color="var(--color-text-muted)" />
                  )}
                </Thumb>
                <RowText>
                  <Primary>{song.title}</Primary>
                  <Secondary>
                    {song.artist}
                    {song.album && ` — ${song.album}`}
                  </Secondary>
                </RowText>
                <AddButton
                  added={count > 0}
                  disabled={pending === song.id}
                  onClick={() => void add(song)}
                >
                  {pending === song.id ? (
                    "Adding…"
                  ) : count > 0 ? (
                    <>
                      <IconCheck size={14} />{" "}
                      {count > 1 ? `Added ×${count}` : "Added"}
                    </>
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

      {songs.length === 0 && (
        <Empty>
          {trimmed.length < 2
            ? "Start typing to find songs in your library."
            : `No songs in your library for “${trimmed}”.`}
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

function LibraryPlaylistModal() {
  const [open, setOpen] = useAtom(libraryPlaylistModalOpenAtom);
  const [editing, setEditing] = useAtom(editingLibraryPlaylistAtom);
  const [addSongsTarget, setAddSongsTarget] = useAtom(
    addLibrarySongsTargetAtom,
  );
  const [seedSongIds, setSeedSongIds] = useAtom(
    newLibraryPlaylistSeedSongsAtom,
  );
  const [playlist, setPlaylist] = useState<PlaylistTarget | null>(null);

  // Lock background scroll; reset to step 1 on close.
  useEffect(() => {
    if (!open) {
      setPlaylist(null);
      setEditing(null);
      setAddSongsTarget(null);
      setSeedSongIds([]);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, setEditing, setAddSongsTarget, setSeedSongIds]);

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
            seedSongIds={seedSongIds}
            onCancel={close}
            onCreated={setPlaylist}
            onSaved={close}
          />
        )}
      </Panel>
    </Overlay>
  );
}

export default LibraryPlaylistModal;
