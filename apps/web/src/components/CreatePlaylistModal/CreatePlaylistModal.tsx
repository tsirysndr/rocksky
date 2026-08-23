// The playlist is created on "Next", not at the end: adding a song needs the
// playlist's AT-URI to reference.
import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useAtom } from "jotai";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  createPlaylistModalOpenAtom,
  editingPlaylistAtom,
} from "../../atoms/createPlaylist";
import {
  useAddSongsToPlaylistMutation,
  useCreatePlaylistMutation,
  useUpdatePlaylistMutation,
} from "../../hooks/usePlaylists";
import { useSearchMutation } from "../../hooks/useSearch";
import { isTrackHit, type TrackHit } from "../../types/search";
import Track from "../Icons/Track";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your playlist a name")
    .max(512, "Name is too long"),
  description: z.string().trim().max(256, "Description is too long"),
});

type FormValues = z.infer<typeof schema>;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
`;

const Panel = styled.div`
  /* The app ships @tailwind utilities without preflight, so there is no global
     box-sizing reset and boxes default to content-box: a width:100% input plus
     padding and border overflows its container to the right. Scope the reset to
     the modal rather than globally, which would shift the rest of the app. */
  &,
  & *,
  & *::before,
  & *::after {
    box-sizing: border-box;
  }

  width: 100%;
  max-width: 640px;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
`;

const Title = styled.h2`
  font-family: RockfordSansBold;
  font-size: 18px;
  margin: 0;
  color: var(--color-text);
`;

const Subtitle = styled.div`
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
`;

const EscHint = styled.kbd`
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-muted);
  padding: 4px 7px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  flex-shrink: 0;
`;

const Form = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.span`
  font-family: RockfordSansBold;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
`;

const inputStyles = `
  width: 100%;
  border-radius: 9px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  background: var(--color-input-background);
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 15px;
  padding: 11px 12px;
  outline: none;

  &:focus {
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const TextInput = styled.input<{ invalid?: boolean }>`
  ${inputStyles}
  border-color: ${({ invalid }) =>
    invalid ? "var(--color-primary)" : "rgba(128, 128, 128, 0.25)"};
`;

const TextArea = styled.textarea<{ invalid?: boolean }>`
  ${inputStyles}
  resize: vertical;
  min-height: 84px;
  border-color: ${({ invalid }) =>
    invalid ? "var(--color-primary)" : "rgba(128, 128, 128, 0.25)"};
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: var(--color-primary);
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 16px 22px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
`;

const QueryInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 18px;

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const Results = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
`;

const Row = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 9px;
  background: ${({ active }) =>
    active ? "var(--color-menu-hover)" : "transparent"};
`;

const Thumb = styled.div`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-skeleton-background);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 22px;
    height: 22px;
  }
`;

const RowText = styled.div`
  min-width: 0;
  flex: 1;
`;

const Primary = styled.div`
  color: var(--color-text);
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Secondary = styled.div`
  color: var(--color-text-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AddButton = styled.button<{ added: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: RockfordSansMedium;
  font-size: 13px;
  padding: 6px 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: ${({ added }) =>
    added ? "var(--color-text-muted)" : "var(--color-primary)"};

  &:hover:not(:disabled) {
    text-decoration: underline;
  }

  &:disabled {
    cursor: default;
  }
`;

const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  padding: 14px 22px;
  border-top: 1px solid rgba(128, 128, 128, 0.18);
  color: var(--color-text-muted);
  font-size: 12px;
`;

const FooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Button = styled.button<{ kind?: "primary" | "ghost" }>`
  font-family: RockfordSansRegular;
  font-size: 14px;
  padding: 9px 18px;
  border-radius: 999px;
  cursor: pointer;
  border: 1px solid
    ${({ kind }) =>
      kind === "primary" ? "transparent" : "rgba(128, 128, 128, 0.3)"};
  background: ${({ kind }) =>
    kind === "primary" ? "var(--color-primary)" : "transparent"};
  color: ${({ kind }) => (kind === "primary" ? "#fff" : "var(--color-text)")};

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

function DetailsStep({
  editing,
  onCancel,
  onCreated,
  onSaved,
}: {
  editing: { uri: string; name: string; description?: string } | null;
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
  const isPending = create.isPending || update.isPending;
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

function SongsStep({
  playlist,
  onDone,
}: {
  playlist: { uri: string; name: string };
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const { mutate, data, reset } = useSearchMutation();
  const addSongs = useAddSongsToPlaylistMutation();
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
    try {
      await addSongs.mutateAsync({ uri: playlist.uri, songs: [track.uri] });
      setAdded((prev) => new Set(prev).add(track.uri));
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
      <Header>
        <div>
          <Title>{playlist.name}</Title>
          <Subtitle>
            {added.size === 0
              ? "Search for songs to add."
              : `${added.size} song${added.size > 1 ? "s" : ""} added.`}
          </Subtitle>
        </div>
        <EscHint>esc</EscHint>
      </Header>

      <SearchRow>
        <SearchIcon size={22} color="var(--color-text-muted)" />
        <QueryInput
          ref={inputRef}
          value={query}
          placeholder="Search songs by title or artist…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </SearchRow>

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

      <Footer>
        <span>New playlists can take a moment to appear on your profile.</span>
        <FooterActions>
          <Button kind="primary" onClick={onDone}>
            Done
          </Button>
        </FooterActions>
      </Footer>
    </>
  );
}

function CreatePlaylistModal() {
  const [open, setOpen] = useAtom(createPlaylistModalOpenAtom);
  const [editing, setEditing] = useAtom(editingPlaylistAtom);
  const [playlist, setPlaylist] = useState<{
    uri: string;
    name: string;
  } | null>(null);

  // Lock background scroll; reset to step 1 on close.
  useEffect(() => {
    if (!open) {
      setPlaylist(null);
      setEditing(null);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, setEditing]);

  if (!open) return null;

  const close = () => setOpen(false);

  return (
    <Overlay onClick={close}>
      <Panel onClick={(e) => e.stopPropagation()}>
        {playlist ? (
          <SongsStep playlist={playlist} onDone={close} />
        ) : (
          <DetailsStep
            editing={editing}
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
