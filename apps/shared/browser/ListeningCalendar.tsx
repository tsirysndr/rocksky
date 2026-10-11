import { useMemo, useRef, useState } from "react";
import { listeningCalendar, type CalendarPoint } from "../listeningCalendar";
import "./ListeningCalendar.css";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function ListeningCalendar({
  points,
  from,
  to,
}: {
  points: CalendarPoint[];
  from: string;
  to: string;
}) {
  const calendar = useMemo(
    () => listeningCalendar(points, from, to),
    [points, from, to],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  if (!calendar) return <p role="status">Choose a valid date range.</p>;
  const { days, offset, weeks, truncated } = calendar;
  const active = days.find((day) => day.key === (selected ?? hovered));
  const focusKey = days.some((day) => day.key === selected)
    ? selected
    : days[0]?.key;
  const months: { key: string; column: number }[] = [];
  days.forEach((day, index) => {
    if (index !== 0 && !day.key.endsWith("-01")) return;
    const column = Math.floor((offset + index) / 7) + 2;
    if (months.length && column - months[months.length - 1].column < 2)
      months.pop();
    months.push({ key: day.key, column });
  });
  return (
    <div className="rs-listening-calendar">
      <p className="rs-calendar-hint">
        {truncated
          ? "Latest 365 days in this range."
          : "Each square is a day in this range."}{" "}
        Dates use UTC. Select a day for its count.
      </p>
      <div
        className="rs-calendar-scroll"
        role="group"
        aria-label="Daily listening calendar"
      >
        <div
          className="rs-calendar-grid"
          style={{ gridTemplateColumns: `32px repeat(${weeks}, 20px)` }}
        >
          {weekdays.map((label, index) => (
            <span
              className="rs-calendar-weekday"
              key={label}
              style={{ gridColumn: 1, gridRow: index + 2 }}
            >
              {index % 2 === 0 ? label : ""}
            </span>
          ))}
          {days.map((day, index) => {
            const column = Math.floor((offset + index) / 7) + 2;
            const row = ((offset + index) % 7) + 2;
            const label = `${dateLabel(day.key)}: ${day.count.toLocaleString()} ${day.count === 1 ? "scrobble" : "scrobbles"}`;
            return (
              <button
                key={day.key}
                ref={(node) => {
                  if (node) buttons.current.set(day.key, node);
                  else buttons.current.delete(day.key);
                }}
                type="button"
                className="rs-calendar-day"
                data-level={day.level}
                style={{ gridColumn: column, gridRow: row }}
                aria-label={label}
                aria-pressed={selected === day.key}
                title={label}
                tabIndex={focusKey === day.key ? 0 : -1}
                onMouseEnter={() => setHovered(day.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => {
                  setHovered(null);
                  setSelected(day.key);
                }}
                onClick={() => setSelected(day.key)}
                onKeyDown={(event) => {
                  const delta = {
                    ArrowDown: 1,
                    ArrowUp: -1,
                    ArrowRight: 7,
                    ArrowLeft: -7,
                  }[event.key];
                  const target =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? days.length - 1
                        : delta === undefined
                          ? null
                          : Math.max(
                              0,
                              Math.min(days.length - 1, index + delta),
                            );
                  if (target === null) return;
                  event.preventDefault();
                  buttons.current.get(days[target].key)?.focus();
                }}
              />
            );
          })}
          {months.map((day) => (
            <span
              key={`month-${day.key}`}
              className="rs-calendar-month"
              style={{
                gridColumn: `${day.column} / span 1`,
                gridRow: 1,
              }}
            >
              {new Date(`${day.key}T00:00:00Z`).toLocaleDateString(undefined, {
                month: "short",
                timeZone: "UTC",
              })}
            </span>
          ))}
        </div>
      </div>
      <p className="rs-calendar-readout" role="status" aria-live="polite">
        {active
          ? `${dateLabel(active.key)} · ${active.count.toLocaleString()} ${active.count === 1 ? "scrobble" : "scrobbles"}`
          : days.every((day) => !day.count)
            ? "No scrobbles in the days shown."
            : `${dateLabel(days[0].key)} – ${dateLabel(days[days.length - 1].key)}`}
      </p>
      <div
        className="rs-calendar-legend"
        aria-label="Color intensity: fewer to more scrobbles"
      >
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="rs-calendar-swatch"
            data-level={level}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
