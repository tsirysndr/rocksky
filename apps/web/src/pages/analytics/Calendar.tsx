import styled from "@emotion/styled";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";

const Panel = styled.div`
  display: flex;
  gap: 22px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);

  @media (max-width: 720px) {
    gap: 0;

    & > :last-of-type {
      display: none;
    }
  }
`;

const MonthBlock = styled.div`
  width: 224px;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  margin-bottom: 8px;
`;

const HeadLabel = styled.div`
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  color: var(--color-text);
`;

const NavButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
`;

const Weekday = styled.div`
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  color: var(--color-text-muted);
`;

type CellProps = {
  selected: boolean;
  inRange: boolean;
  muted: boolean;
  disabled: boolean;
};

const Cell = styled.button<CellProps>`
  height: 30px;
  padding: 0;
  border: none;
  border-radius: ${({ inRange, selected }) =>
    selected ? "8px" : inRange ? "0" : "8px"};
  font-family: var(--font-mono);
  font-size: 0.75rem;
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
  background: ${({ selected, inRange }) =>
    selected
      ? "var(--color-primary)"
      : inRange
        ? "var(--color-menu-hover)"
        : "transparent"};
  color: ${({ selected, muted, disabled }) =>
    selected
      ? "#fff"
      : disabled || muted
        ? "var(--color-text-muted)"
        : "var(--color-text)"};
  opacity: ${({ disabled, muted }) => (disabled ? 0.35 : muted ? 0.55 : 1)};

  &:hover:not(:disabled) {
    background: ${({ selected }) =>
      selected ? "var(--color-primary)" : "var(--color-menu-hover)"};
  }
`;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** The 42 cells of a month grid, Monday-first, padded from the neighbouring months. */
function monthCells(month: Dayjs): Dayjs[] {
  const first = month.startOf("month");
  const lead = (first.day() + 6) % 7;
  const start = first.subtract(lead, "day");
  return Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
}

function Month({
  month,
  from,
  to,
  min,
  max,
  onPick,
  onNavigate,
  showPrev,
  showNext,
}: {
  month: Dayjs;
  from: Dayjs | null;
  to: Dayjs | null;
  min: Dayjs;
  max: Dayjs;
  onPick: (day: Dayjs) => void;
  onNavigate: (delta: number) => void;
  showPrev: boolean;
  showNext: boolean;
}) {
  return (
    <MonthBlock>
      <Head>
        {showPrev ? (
          <NavButton
            type="button"
            aria-label="Previous month"
            disabled={month.startOf("month").isBefore(min)}
            onClick={() => onNavigate(-1)}
          >
            <IconChevronLeft size={16} />
          </NavButton>
        ) : (
          <span style={{ width: 26 }} />
        )}
        <HeadLabel>{month.format("MMMM YYYY")}</HeadLabel>
        {showNext ? (
          <NavButton
            type="button"
            aria-label="Next month"
            disabled={month.endOf("month").isAfter(max)}
            onClick={() => onNavigate(1)}
          >
            <IconChevronRight size={16} />
          </NavButton>
        ) : (
          <span style={{ width: 26 }} />
        )}
      </Head>
      <Grid>
        {WEEKDAYS.map((day) => (
          <Weekday key={day}>{day}</Weekday>
        ))}
        {monthCells(month).map((day) => {
          const disabled = day.isBefore(min, "day") || day.isAfter(max, "day");
          const selected =
            (!!from && day.isSame(from, "day")) ||
            (!!to && day.isSame(to, "day"));
          const inRange =
            !!from &&
            !!to &&
            day.isAfter(from, "day") &&
            day.isBefore(to, "day");
          return (
            <Cell
              key={day.valueOf()}
              type="button"
              disabled={disabled}
              selected={selected}
              inRange={inRange}
              muted={!day.isSame(month, "month")}
              onClick={() => onPick(day)}
            >
              {day.date()}
            </Cell>
          );
        })}
      </Grid>
    </MonthBlock>
  );
}

/**
 * Two-month range calendar. Native date inputs only expose `color-scheme` for
 * theming, which is not enough to make the popover match the app, so the grid
 * is ours.
 */
function Calendar({
  from,
  to,
  min,
  max,
  onSelect,
}: {
  from: string;
  to: string;
  min: string;
  max: string;
  onSelect: (from: string, to: string) => void;
}) {
  const minDay = dayjs(min).startOf("day");
  const maxDay = dayjs(max).endOf("day");
  const [cursor, setCursor] = useState(() =>
    dayjs(to).startOf("month").subtract(1, "month"),
  );
  const [pending, setPending] = useState<Dayjs | null>(null);

  const start = pending ?? dayjs(from).startOf("day");
  const end = pending ? null : dayjs(to).startOf("day");

  const pick = (day: Dayjs) => {
    if (!pending) {
      setPending(day);
      return;
    }
    const [a, b] = day.isBefore(pending) ? [day, pending] : [pending, day];
    setPending(null);
    onSelect(a.format("YYYY-MM-DD"), b.format("YYYY-MM-DD"));
  };

  const navigate = (delta: number) => setCursor((c) => c.add(delta, "month"));

  return (
    <Panel>
      <Month
        month={cursor}
        from={start}
        to={end}
        min={minDay}
        max={maxDay}
        onPick={pick}
        onNavigate={navigate}
        showPrev
        showNext={false}
      />
      <Month
        month={cursor.add(1, "month")}
        from={start}
        to={end}
        min={minDay}
        max={maxDay}
        onPick={pick}
        onNavigate={navigate}
        showPrev={false}
        showNext
      />
    </Panel>
  );
}

export default Calendar;
