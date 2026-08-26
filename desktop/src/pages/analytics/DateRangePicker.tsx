import styled from "@emotion/styled";
import dayjs from "dayjs";

export type Range = { from: string; to: string; label: string };

const PRESETS: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
  { label: "All time", days: null },
];

const EPOCH = "2024-01-01";

export function presetRange(label: string): Range {
  const preset = PRESETS.find((p) => p.label === label) ?? PRESETS[1];
  const to = dayjs().format("YYYY-MM-DD");
  const from = preset.days
    ? dayjs().subtract(preset.days - 1, "day").format("YYYY-MM-DD")
    : EPOCH;
  return { from, to, label: preset.label };
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
`;

const Preset = styled.button<{ active: boolean }>`
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid
    ${({ active }) => (active ? "transparent" : "rgba(128,128,128,0.28)")};
  background: ${({ active }) =>
    active ? "var(--color-primary)" : "transparent"};
  color: ${({ active }) => (active ? "#fff" : "var(--color-text-muted)")};
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    color: ${({ active }) => (active ? "#fff" : "var(--color-text)")};
  }
`;

const Custom = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
`;

const DateInput = styled.input`
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  background: var(--color-input-background);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color-scheme: light;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  &::-webkit-calendar-picker-indicator {
    cursor: pointer;
  }

  /* The theme is a class, not the OS setting, so the native calendar popover
     and its glyph have to be told about dark mode explicitly. */
  .dark & {
    color-scheme: dark;
  }
`;

function DateRangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  const setBound = (key: "from" | "to", next: string) => {
    if (!next) return;
    const candidate = { ...value, [key]: next, label: "Custom" };
    if (dayjs(candidate.from).isAfter(dayjs(candidate.to))) {
      onChange(
        key === "from"
          ? { ...candidate, to: next }
          : { ...candidate, from: next },
      );
      return;
    }
    onChange(candidate);
  };

  return (
    <Bar>
      {PRESETS.map((p) => (
        <Preset
          key={p.label}
          type="button"
          active={value.label === p.label}
          onClick={() => onChange(presetRange(p.label))}
        >
          {p.label}
        </Preset>
      ))}
      <Custom>
        <DateInput
          type="date"
          aria-label="From"
          value={value.from}
          max={value.to}
          onChange={(e) => setBound("from", e.target.value)}
        />
        <span>→</span>
        <DateInput
          type="date"
          aria-label="To"
          value={value.to}
          min={value.from}
          max={dayjs().format("YYYY-MM-DD")}
          onChange={(e) => setBound("to", e.target.value)}
        />
      </Custom>
    </Bar>
  );
}

export default DateRangePicker;
