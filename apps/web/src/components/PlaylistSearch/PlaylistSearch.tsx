import styled from "@emotion/styled";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

// Spotify's "Search in playlist": a magnifier that expands into an input and
// collapses again when empty. A quick filter over the rows already on the page.

const QUERY_MAX = 128;

const schema = z.object({
  query: z.string().max(QUERY_MAX, `Keep it under ${QUERY_MAX} characters`),
});

type FormValues = z.infer<typeof schema>;

const Wrap = styled.div`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }
`;

const Field = styled.div<{ invalid?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px 0 12px;
  border-radius: 999px;
  border: 1px solid
    ${({ invalid }) =>
      invalid ? "var(--color-primary)" : "rgba(128, 128, 128, 0.25)"};
  background: var(--color-input-background);
  color: var(--color-text-muted);

  &:focus-within {
    border-color: var(--color-primary);
  }
`;

const Input = styled.input`
  width: 180px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 0.875rem;
  padding: 0;

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const ClearButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: var(--color-text);
  }
`;

type Props = {
  /** Called with the filter term; "" whenever it is cleared or collapsed. */
  onChange: (value: string) => void;
  /** Lets the parent yield room to the expanded input. */
  onExpandedChange?: (expanded: boolean) => void;
  label?: string;
  placeholder?: string;
};

function PlaylistSearch({
  onChange,
  onExpandedChange,
  label = "Search in playlist",
  placeholder = "Search in playlist",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { query: "" },
  });

  const query = watch("query");
  const invalid = !!errors.query;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    // An over-long query leaves the last good filter in place.
    if (!invalid) onChangeRef.current(query);
  }, [query, invalid]);

  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;
  useEffect(() => {
    onExpandedChangeRef.current?.(expanded);
  }, [expanded]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const collapse = () => {
    setExpanded(false);
    reset({ query: "" });
    onChangeRef.current("");
  };

  if (!expanded) {
    return (
      <Wrap>
        <IconButton
          type="button"
          aria-label={label}
          title={label}
          onClick={() => setExpanded(true)}
        >
          <IconSearch size={18} />
        </IconButton>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Field invalid={invalid}>
        <IconSearch size={16} />
        <Controller
          name="query"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              ref={(el) => {
                field.ref(el);
                inputRef.current = el;
              }}
              placeholder={placeholder}
              aria-label={label}
              aria-invalid={invalid}
              title={errors.query?.message}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // The global shortcut handler also listens for Escape.
                  e.stopPropagation();
                  collapse();
                }
              }}
              onBlur={() => {
                field.onBlur();
                if (!field.value) setExpanded(false);
              }}
            />
          )}
        />
        {query && (
          <ClearButton
            type="button"
            aria-label="Clear search"
            title="Clear search"
            // mousedown, not click: blur would collapse the field first.
            onMouseDown={(e) => {
              e.preventDefault();
              setValue("query", "", { shouldValidate: true });
              inputRef.current?.focus();
            }}
          >
            <IconX size={14} />
          </ClearButton>
        )}
      </Field>
    </Wrap>
  );
}

export default PlaylistSearch;
