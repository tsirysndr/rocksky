import styled from "@emotion/styled";
import { IconCalendar } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import Calendar from "./Calendar";

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
  position: relative;
  margin-left: auto;
`;

const Trigger = styled.button<{ open: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid
    ${({ open }) => (open ? "var(--color-primary)" : "rgba(128,128,128,0.28)")};
  background: var(--color-input-background);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  cursor: pointer;

  svg {
    color: var(--color-text-muted);
  }
`;

const Popover = styled.div`
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
`;

function DateRangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

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
      <Custom ref={anchor}>
        <Trigger open={open} type="button" onClick={() => setOpen(!open)}>
          <IconCalendar size={15} />
          {value.from} → {value.to}
        </Trigger>
        {open && (
          <Popover>
            <Calendar
              from={value.from}
              to={value.to}
              min={EPOCH}
              max={dayjs().format("YYYY-MM-DD")}
              onSelect={(from, to) => {
                onChange({ from, to, label: "Custom" });
                setOpen(false);
              }}
            />
          </Popover>
        )}
      </Custom>
    </Bar>
  );
}

export default DateRangePicker;
