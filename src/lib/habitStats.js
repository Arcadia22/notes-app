// Converts a Date to "YYYY-MM-DD"
export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Whether a habit is "due" on a given day-of-week (0=Sun..6=Sat).
// trackDays is either "daily" or an array of day-of-week numbers.
export function isDueOnDay(habit, dayOfWeek) {
  if (habit.trackDays === "daily") return true;
  if (Array.isArray(habit.trackDays)) return habit.trackDays.includes(dayOfWeek);
  return true;
}

// Returns the 7 days of the current calendar week (Sunday through
// Saturday), as Date objects — matching the app's Sunday-start
// convention everywhere else, rather than a rolling "last 7 days"
// window that could start on any weekday.
export function getLast7Days() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - today.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// Current streak: counts consecutive due-days, working backward from
// today, that have a completion entry. Stops at the first due-day that's
// missing an entry. Days the habit isn't due on don't break the streak.
export function calculateStreak(habit, entryDateSet) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 3650; i++) {
    const dateStr = toDateStr(cursor);
    const dayOfWeek = cursor.getDay();

    if (isDueOnDay(habit, dayOfWeek)) {
      if (entryDateSet.has(dateStr)) {
        streak++;
      } else {
        const isToday = dateStr === toDateStr(new Date());
        if (!isToday) break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// Completion percentage for one specific calendar month (year/month are
// the same convention as JS Date: month is 0-indexed). Only counts days
// up to today if the month is the current one in progress, and only
// counts days the habit was actually due. Failed days are excluded
// entirely from both the numerator and denominator — they don't count
// against the percentage, they're just left out.
export function calculateMonthCompletionRate(habit, entryDateSet, year, month, failedDateSet = new Set()) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const lastCountableDay = lastOfMonth > today ? today : lastOfMonth;

  let due = 0;
  let done = 0;
  const cursor = new Date(firstOfMonth);
  while (cursor <= lastCountableDay) {
    const dateStr = toDateStr(cursor);
    if (isDueOnDay(habit, cursor.getDay()) && !failedDateSet.has(dateStr)) {
      due++;
      if (entryDateSet.has(dateStr)) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return due === 0 ? null : Math.round((done / due) * 100);
}

// Completion percentage over the last `days` calendar days, counting
// only days the habit was actually due. Failed days are excluded
// entirely, same as the month version above.
export function calculateCompletionRate(habit, entryDateSet, days = 7, failedDateSet = new Set()) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let due = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toDateStr(d);
    if (isDueOnDay(habit, d.getDay()) && !failedDateSet.has(dateStr)) {
      due++;
      if (entryDateSet.has(dateStr)) done++;
    }
  }

  return due === 0 ? 0 : Math.round((done / due) * 100);
}
