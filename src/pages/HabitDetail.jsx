import { useState, useEffect, useMemo, Fragment } from "react";
import { useParams, Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";
import { Sakura } from "../components/Decorations";
import { auth } from "../firebase";
import { listenToHabits, listenToHabitEntries } from "../lib/habits";
import { toDateStr, isDueOnDay, calculateStreak, calculateCompletionRate, calculateMonthCompletionRate } from "../lib/habitStats";
import { CATEGORY_COLORS, getCategoryColor } from "../lib/categoryColors";
import TimedHabitTracker from "../components/TimedHabitTracker";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// Builds a month-grid: each row is a calendar week (Sun-Sat), each cell
// holds the actual Date for that day, or null for the leading/trailing
// blanks before day 1 / after the last day of the month.
function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startDow = firstOfMonth.getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

function HabitDetail() {
  const { habitId } = useParams();
  const uid = auth.currentUser?.uid;
  const [habits, setHabits] = useState([]);
  const [entries, setEntries] = useState([]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [cursorYear, setCursorYear] = useState(today.getFullYear());
  const [cursorMonth, setCursorMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!uid) return;
    const unsubHabits = listenToHabits(uid, setHabits);
    const unsubEntries = listenToHabitEntries(uid, setEntries);
    return () => {
      unsubHabits();
      unsubEntries();
    };
  }, [uid]);

  const habit = habits.find((h) => h.id === habitId);
  const habitEntries = useMemo(
    () => entries.filter((e) => e.habitId === habitId),
    [entries, habitId]
  );
  const entryDateSet = useMemo(
    () => new Set(habitEntries.filter((e) => (e.status || "done") === "done").map((e) => e.date)),
    [habitEntries]
  );
  const failedDateSet = useMemo(
    () => new Set(habitEntries.filter((e) => e.status === "failed").map((e) => e.date)),
    [habitEntries]
  );

  const monthRows = useMemo(() => buildMonthGrid(cursorYear, cursorMonth), [cursorYear, cursorMonth]);
  const todayStr = toDateStr(today);

  // List of past months (most recent first), going back to the habit's
  // creation month if known, otherwise capped at 12 months so this
  // doesn't grow unbounded for habits without a recorded start date.
  const pastMonths = useMemo(() => {
    if (!habit) return [];
    const months = [];
    let y = today.getFullYear();
    let m = today.getMonth() - 1; // start from the month before the current one

    let cutoffY = today.getFullYear() - 1;
    let cutoffM = today.getMonth();
    if (habit.createdAt) {
      const [cy, cm] = habit.createdAt.split("-").map(Number);
      cutoffY = cy;
      cutoffM = cm - 1;
    }

    for (let i = 0; i < 24; i++) {
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      if (y < cutoffY || (y === cutoffY && m < cutoffM)) break;

      months.push({ year: y, month: m });
      m -= 1;
    }
    return months;
  }, [habit, today]);

  const goToPrevMonth = () => {
    if (cursorMonth === 0) {
      setCursorYear((y) => y - 1);
      setCursorMonth(11);
    } else {
      setCursorMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (cursorMonth === 11) {
      setCursorYear((y) => y + 1);
      setCursorMonth(0);
    } else {
      setCursorMonth((m) => m + 1);
    }
  };

  if (!habit) {
    return (
      <PageLayout title="Habit">
        <div className="max-w-md mx-auto px-4 pt-4 pb-10">
          <Link to="/habits" className="text-xs text-accent-500 dark:text-accent-300 font-medium">
            &#8249; Back to Tracker
          </Link>
          <p className="text-sm text-brand-300 dark:text-brand-500 italic mt-6 text-center">
            Loading...
          </p>
        </div>
      </PageLayout>
    );
  }

  const color = getCategoryColor(habit.color, true, habit.customColor);
  const streak = calculateStreak(habit, entryDateSet);
  const rate30 = calculateCompletionRate(habit, entryDateSet, 30, failedDateSet);
  const monthLabel = new Date(cursorYear, cursorMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <PageLayout title={habit.name}>
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <Link
          to="/habits"
          className="inline-flex items-center gap-1 text-xs text-accent-500 dark:text-accent-300 font-medium mb-3"
        >
          &#8249; Back to Tracker
        </Link>

        <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 mb-4 flex items-center gap-2">
          <Sakura className="w-4 h-4" />
          {habit.name.toUpperCase()}
        </h2>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
            <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-0.5">CURRENT STREAK</p>
            <p className="text-lg font-semibold text-brand-700 dark:text-brand-200">
              {streak} day{streak !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
            <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-0.5">LAST 30 DAYS</p>
            <p className="text-lg font-semibold text-brand-700 dark:text-brand-200">{rate30}%</p>
          </div>
        </div>

        {/* Timed habit tracker — shown instead of manual checkboxes */}
        {habit.trackType === "timed" && (
          <div className="mb-6">
            <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-3">TIMER</p>
            <TimedHabitTracker uid={uid} habit={habit} entries={entries} />
          </div>
        )}

        {/* Monthly heatmap */}
        <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3">
          <div className="grid grid-cols-[16px_1fr_1fr] items-center mb-3">
            <div />
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={goToPrevMonth}
                className="p-1.5 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900 rounded-lg"
                aria-label="Previous month"
              >
                &#8249;
              </button>
              <span className="text-xs font-pixel text-brand-700 dark:text-brand-200 whitespace-nowrap">
                {monthLabel.toUpperCase()}
              </span>
              <button
                onClick={goToNextMonth}
                className="p-1.5 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900 rounded-lg"
                aria-label="Next month"
              >
                &#8250;
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[16px_repeat(7,1fr)] gap-1">
            <div />
            {DAY_LETTERS.map((d, i) => (
              <div
                key={i}
                className="text-center text-[9px] font-pixel text-brand-400 dark:text-brand-500"
              >
                {d}
              </div>
            ))}

            {monthRows.map((row, ri) => (
              <Fragment key={ri}>
                <div key={`label-${ri}`} />
                {row.map((day, di) => {
                  if (!day) {
                    return <div key={`${ri}-${di}`} className="aspect-square" />;
                  }
                  const dateStr = toDateStr(day);
                  const due = isDueOnDay(habit, day.getDay());
                  const done = entryDateSet.has(dateStr);
                  const failed = failedDateSet.has(dateStr);
                  const isFuture = day > today;
                  const isToday = dateStr === todayStr;

                  let cellClass = "bg-brand-50 dark:bg-brand-900 text-brand-300 dark:text-brand-600";
                  let cellStyle;
                  if (due && !isFuture) {
                    if (done) {
                      if (color.isCustom) {
                        cellClass = "text-white";
                        cellStyle = { backgroundColor: color.hex };
                      } else {
                        cellClass = `${color.dot} text-white`;
                      }
                    } else if (failed) {
                      cellClass = "bg-red-100 dark:bg-red-950 text-red-500 dark:text-red-400";
                    } else {
                      cellClass = "bg-brand-100 dark:bg-brand-700 text-brand-400 dark:text-brand-400";
                    }
                  } else if (isFuture) {
                    cellClass = "bg-white dark:bg-brand-800 text-brand-200 dark:text-brand-700";
                  }

                  return (
                    <div
                      key={`${ri}-${di}`}
                      className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-medium ${cellClass} ${
                        isToday ? "ring-2 ring-accent-500 dark:ring-accent-300" : ""
                      }`}
                      style={cellStyle}
                    >
                      {day.getDate()}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Past months summary */}
        <div className="mt-4">
          <h3 className="text-xs font-pixel text-brand-600 dark:text-brand-300 mb-2 px-1">
            PAST DATA
          </h3>
          {pastMonths.length === 0 ? (
            <p className="text-xs text-brand-300 dark:text-brand-500 italic px-1">
              No past months to show yet.
            </p>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 overflow-hidden">
              <div className="divide-y divide-brand-50 dark:divide-brand-700 max-h-[220px] overflow-y-auto">
                {pastMonths.map(({ year, month }) => {
                  const rate = calculateMonthCompletionRate(habit, entryDateSet, year, month, failedDateSet);
                  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <button
                      key={`${year}-${month}`}
                      onClick={() => {
                        setCursorYear(year);
                        setCursorMonth(month);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-700 transition"
                    >
                      <span className="text-sm text-brand-700 dark:text-brand-200">{label}</span>
                      <span className="text-sm font-semibold text-brand-800 dark:text-brand-100">
                        {rate === null ? "—" : `${rate}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default HabitDetail;
