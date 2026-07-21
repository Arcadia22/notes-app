// Converts "HH:MM" into total minutes since midnight, for positioning
// events on a vertical timeline.
export function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Given a day's occurrences, splits them into timed events (with start/end)
// and all-day events (shown separately, since they have no time slot).
export function splitTimedAndAllDay(occurrences) {
  const timed = [];
  const allDay = [];
  for (const occ of occurrences) {
    if (occ.allDay) allDay.push(occ);
    else timed.push(occ);
  }
  return { timed, allDay };
}

// Assigns each timed event a "column" and "columnCount" so that
// overlapping events render side-by-side instead of stacking on top
// of each other. Simple greedy approach: sort by start time, then
// place each event in the first column where it doesn't overlap
// anything already placed; columnCount is the max columns touched
// by any cluster of mutually-overlapping events.
export function layoutTimedEvents(timed) {
  const sorted = [...timed].sort((a, b) => {
    const aStart = timeToMinutes(a.startTime);
    const bStart = timeToMinutes(b.startTime);
    if (aStart !== bStart) return aStart - bStart;
    return timeToMinutes(a.endTime) - timeToMinutes(b.endTime);
  });

  const columns = []; // columns[i] = end-minute of the last event placed in column i
  const placed = sorted.map((occ) => {
    const start = timeToMinutes(occ.startTime);
    const end = Math.max(timeToMinutes(occ.endTime), start + 15); // minimum visual height

    let columnIndex = columns.findIndex((colEnd) => colEnd <= start);
    if (columnIndex === -1) {
      columnIndex = columns.length;
      columns.push(end);
    } else {
      columns[columnIndex] = end;
    }

    return { ...occ, _start: start, _end: end, _column: columnIndex };
  });

  // For each event, figure out how many columns are active during its
  // own time span, so it knows how wide to render (events early in a
  // cluster shouldn't render full-width if something later overlaps them).
  return placed.map((occ) => {
    const overlapping = placed.filter(
      (other) => other._start < occ._end && other._end > occ._start
    );
    const columnCount = Math.max(...overlapping.map((o) => o._column)) + 1;
    return { ...occ, columnCount };
  });
}
