import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout";
import AddEventModal from "../components/AddEventModal";
import MonthYearPicker from "../components/MonthYearPicker";
import EventDetailModal from "../components/EventDetailModal";
import UpcomingEventsList from "../components/UpcomingEventsList";
import CategoryManager from "../components/CategoryManager";
import { auth } from "../firebase";
import {
  listenToEvents,
  listenToCategories,
  expandEventsInRange,
  getUpcomingOccurrences,
  toDateStr,
} from "../lib/events";
import { getCategoryColor } from "../lib/categoryColors";
import { timeToMinutes, splitTimedAndAllDay, layoutTimedEvents } from "../lib/dayTimeline";
import { Sakura, PixelLantern } from "../components/Decorations";
import BlockLibraryManager from "../components/BlockLibraryManager";
import RoutineWeekView from "../components/RoutineWeekView";
import FreeformBlockPalette from "../components/FreeformBlockPalette";
import { listenToBlockDefinitions } from "../lib/routine";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const VIEWS = ["day", "week", "month", "list"];

function startOfMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - firstOfMonth.getDay());
  return start;
}

function buildMonthGridDays(year, month) {
  const start = startOfMonthGrid(year, month);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

// Returns the 7 Date objects (Sun-Sat) for the week containing `date`
function buildWeekDays(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatWeekRangeLabel(weekDays) {
  const first = weekDays[0];
  const last = weekDays[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const firstLabel = first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const lastLabel = sameMonth
    ? last.toLocaleDateString(undefined, { day: "numeric" })
    : last.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${firstLabel} – ${lastLabel}`;
}

function formatSelectedDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatTimeShort(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

// Renders a category-color dot, handling both preset (Tailwind class)
// and custom (inline hex style) colors transparently — used everywhere
// an event's category dot shows up across Month/Week/Day/List views.
function ColorDot({ color, className = "" }) {
  if (color.isCustom) {
    return <span className={`rounded-full ${className}`} style={color.dotStyle} />;
  }
  return <span className={`rounded-full ${color.dot} ${className}`} />;
}

function Calendar() {
  const uid = auth.currentUser?.uid;
  // Routine state (nested in week view)
  const [blockDefs, setBlockDefs] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [routineWeekOffset, setRoutineWeekOffset] = useState(0);
  const routineResetRef = useRef(null);

  useEffect(() => {
    if (!uid) return;
    return listenToBlockDefinitions(uid, setBlockDefs);
  }, [uid]);

  const freeformDefs = blockDefs.filter((b) => b.type === "freeform");

  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState("day");
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [selectedOccurrence, setSelectedOccurrence] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [openPastMonths, setOpenPastMonths] = useState({});
  const dayTimelineScrollRef = useRef(null);
  const [addModalStartTime, setAddModalStartTime] = useState(null);

  const todayStr = toDateStr(new Date());
  const [searchParams] = useSearchParams();
  const dateFromUrl = searchParams.get("date");
  const eventIdFromUrl = searchParams.get("event");

  const [selectedDate, setSelectedDate] = useState(dateFromUrl || todayStr);
  const [cursorDate, setCursorDate] = useState(() => {
    if (dateFromUrl) {
      const [y, m, d] = dateFromUrl.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  useEffect(() => {
    if (!uid) return;
    const unsubEvents = listenToEvents(uid, setEvents);
    const unsubCategories = listenToCategories(uid, setCategories);
    return () => {
      unsubEvents();
      unsubCategories();
    };
  }, [uid]);

  // Auto-open an event's details when arriving via a link that specifies
  // both ?event= and ?date= (e.g. from Today's quick view). Runs once
  // events have actually loaded, since we need the real event data to
  // build a full occurrence object for the detail modal.
  useEffect(() => {
    if (!eventIdFromUrl || !dateFromUrl || events.length === 0) return;

    const baseEvent = events.find((e) => e.id === eventIdFromUrl);
    if (!baseEvent) return;

    const [y, m, d] = dateFromUrl.split("-").map(Number);
    const targetDate = new Date(y, m - 1, d);
    const occurrencesOnDate = expandEventsInRange(events, targetDate, targetDate);
    const match = occurrencesOnDate.find((occ) => occ.id === eventIdFromUrl);

    if (match) {
      setSelectedOccurrence(match);
    }
  }, [eventIdFromUrl, dateFromUrl, events]);

  // Auto-scroll the Day-view timeline so the "now" line sits roughly in
  // the middle of the visible window, rather than opening scrolled to
  // midnight. Only relevant when actually viewing today in Day view.
  const todayStrForScroll = toDateStr(new Date());
  useEffect(() => {
    if (view !== "day" || selectedDate !== todayStrForScroll) return;
    const container = dayTimelineScrollRef.current;
    if (!container) return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowTop = 24 + (nowMinutes / 30) * 32; // matches the gridline math below
    const containerHeight = container.clientHeight;

    // Center the current-time line in the visible window, clamped so we
    // don't scroll past the top or bottom of the timeline.
    const targetScroll = Math.max(0, nowTop - containerHeight / 2);
    container.scrollTop = targetScroll;
  }, [view, selectedDate, todayStrForScroll]);

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();

  const monthGridDays = useMemo(() => buildMonthGridDays(year, month), [year, month]);
  const monthRangeStart = monthGridDays[0];
  const monthRangeEnd = monthGridDays[monthGridDays.length - 1];

  const monthOccurrences = useMemo(
    () => expandEventsInRange(events, monthRangeStart, monthRangeEnd),
    [events, monthRangeStart, monthRangeEnd]
  );

  const occurrencesByDate = useMemo(() => {
    const map = {};
    for (const occ of monthOccurrences) {
      if (!map[occ.occurrenceDate]) map[occ.occurrenceDate] = [];
      map[occ.occurrenceDate].push(occ);
    }
    return map;
  }, [monthOccurrences]);

  // Week view's own day range + occurrences, independent of the month grid
  // (a week can span two different months near month boundaries).
  const weekDays = useMemo(() => buildWeekDays(cursorDate), [cursorDate]);
  const weekRangeStart = weekDays[0];
  const weekRangeEnd = weekDays[6];

  const weekOccurrences = useMemo(
    () => expandEventsInRange(events, weekRangeStart, weekRangeEnd),
    [events, weekRangeStart, weekRangeEnd]
  );

  const weekOccurrencesByDate = useMemo(() => {
    const map = {};
    for (const occ of weekOccurrences) {
      if (!map[occ.occurrenceDate]) map[occ.occurrenceDate] = [];
      map[occ.occurrenceDate].push(occ);
    }
    return map;
  }, [weekOccurrences]);

  // Events for whichever day is currently selected. If the selected day
  // falls outside the visible month range, expand just that single day.
  const selectedDayOccurrences = useMemo(() => {
    if (occurrencesByDate[selectedDate]) return occurrencesByDate[selectedDate];
    const [y, m, d] = selectedDate.split("-").map(Number);
    const single = new Date(y, m - 1, d);
    return expandEventsInRange(events, single, single);
  }, [selectedDate, occurrencesByDate, events]);

  // Day view's own data: occurrences just for selectedDate, split into
  // timed vs all-day, with timed events laid out into columns.
  const dayViewOccurrences = selectedDayOccurrences;
  const { timed: dayTimedEvents, allDay: dayAllDayEvents } = useMemo(
    () => splitTimedAndAllDay(dayViewOccurrences),
    [dayViewOccurrences]
  );
  const dayTimedLayout = useMemo(() => layoutTimedEvents(dayTimedEvents), [dayTimedEvents]);

  // List view: every event, expanded across a wide range (1 year back,
  // 2 years forward) so recurring events show their occurrences too,
  // sorted chronologically. This is intentionally a generous but bounded
  // window rather than truly "infinite" so it stays fast.
  // List view: every event ever recorded, including every occurrence of
  // recurring ones. Since recurring events now require an end date (see
  // AddEventModal/EventDetailModal), this range can be wide without risking
  // runaway generation — we just need it to comfortably cover "the earliest
  // event anyone might add" to "the furthest a recurrence could be stopped".
  // List view: truly all events ever recorded, including every occurrence
  // of recurring ones, however far in the future they go. The range below
  // is intentionally enormous (essentially "all time") rather than a
  // realistic few-year window — combined with the raised iteration cap
  // in expandEventsInRange, this means nothing gets silently cut off.
  // For the list view we expand a wide range but then deduplicate recurring
  // events — showing only the single next occurrence closest to today.
  const allOccurrencesForList = useMemo(() => {
    const rangeStart = new Date(1970, 0, 1);
    const rangeEnd = new Date(2200, 0, 1);
    return expandEventsInRange(events, rangeStart, rangeEnd);
  }, [events]);

  // Upcoming: deduplicate recurring events to their next occurrence only.
  const upcomingListOccurrences = useMemo(() => {
    const all = allOccurrencesForList.filter((o) => o.occurrenceDate >= todayStr);
    // For recurring events, keep only the earliest (closest) occurrence per event id.
    const seen = new Set();
    const deduped = [];
    for (const occ of all) {
      if (occ.isRecurring) {
        if (seen.has(occ.id)) continue;
        seen.add(occ.id);
      }
      deduped.push(occ);
    }
    return deduped;
  }, [allOccurrencesForList, todayStr]);

  const pastListOccurrences = useMemo(() => {
    const all = allOccurrencesForList
      .filter((o) => o.occurrenceDate < todayStr)
      .reverse(); // newest first so first-seen = most recent
    const seen = new Set();
    const deduped = [];
    for (const occ of all) {
      if (occ.isRecurring) {
        if (seen.has(occ.id)) continue;
        seen.add(occ.id);
      }
      deduped.push(occ);
    }
    return deduped;
  }, [allOccurrencesForList, todayStr]);

  // Group past occurrences by "YYYY-MM"
  const pastListByMonth = useMemo(() => {
    const map = {};
    for (const occ of pastListOccurrences) {
      const key = occ.occurrenceDate.slice(0, 7);
      if (!map[key]) map[key] = [];
      map[key].push(occ);
    }
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a)) // newest month first
      .map((key) => {
        const [y, m] = key.split("-");
        const label = new Date(Number(y), Number(m) - 1, 1)
          .toLocaleDateString(undefined, { month: "long", year: "numeric" });
        return { key, label, occurrences: map[key] };
      });
  }, [pastListOccurrences]);

  const upcomingOccurrences = useMemo(
    () => getUpcomingOccurrences(events, 6),
    [events]
  );

  const goToPrevMonth = () => setCursorDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCursorDate(new Date(year, month + 1, 1));

  const goToPrevWeek = () => {
    const prev = new Date(cursorDate);
    prev.setDate(prev.getDate() - 7);
    setCursorDate(prev);
  };
  const goToNextWeek = () => {
    const next = new Date(cursorDate);
    next.setDate(next.getDate() + 7);
    setCursorDate(next);
  };

  const goToToday = () => {
    const now = new Date();
    setCursorDate(now);
    setSelectedDate(todayStr);
  };

  const monthLabel = cursorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const isViewingToday = selectedDate === todayStr;
  const [showCategories, setShowCategories] = useState(false);

  return (
    <PageLayout title="Calendar">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10 md:max-w-none md:px-8 md:pt-6">
        <div className="md:flex md:items-stretch md:gap-8">
          {/* ---------- LEFT: the calendar itself (view switcher + month/week/day/list) ---------- */}
          <div className="md:flex-1 md:flex md:flex-col">
        {/* View switcher + today shortcut + categories */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex flex-1 rounded-xl bg-brand-100 dark:bg-brand-700 p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 py-1 rounded-lg text-[9px] font-pixel uppercase transition ${
                  view === v
                    ? "bg-white dark:bg-brand-700 text-brand-600 dark:text-brand-200 shadow-sm"
                    : "text-brand-400 dark:text-brand-500"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {!isViewingToday && (
            <button
              onClick={goToToday}
              className="px-3 py-2 rounded-xl bg-brand-500 text-white text-xs font-pixel hover:bg-brand-600 whitespace-nowrap"
            >
              TODAY
            </button>
          )}
          <button
            onClick={() => setShowCategories(s => !s)}
            title="Manage event categories"
            className={`px-2.5 py-2 rounded-xl text-xs font-pixel transition ${
              showCategories
                ? "bg-accent-500 text-white"
                : "bg-brand-100 dark:bg-brand-700 text-brand-500 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-600"
            }`}
          >
            🏷️
          </button>
        </div>

        {/* Categories panel */}
        {showCategories && (
          <div className="mb-4 rounded-2xl border-2 shadow-sm border-accent-200 dark:border-accent-700 bg-white dark:bg-brand-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-pixel text-brand-600 dark:text-brand-300">EVENT CATEGORIES</p>
              <button onClick={() => setShowCategories(false)} className="text-brand-400 text-lg leading-none">&times;</button>
            </div>
            <CategoryManager />
          </div>
        )}

        {view === "month" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={goToPrevMonth}
                className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg"
                aria-label="Previous month"
              >
                &#8249;
              </button>
              <button
                onClick={() => setShowMonthYearPicker(true)}
                className="text-sm font-medium text-brand-700 dark:text-brand-100 hover:text-brand-600 underline decoration-dotted decoration-brand-300 underline-offset-4"
              >
                {monthLabel}
              </button>
              <button
                onClick={goToNextMonth}
                className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg"
                aria-label="Next month"
              >
                &#8250;
              </button>
            </div>

            <div className="md:h-[calc(100vh-340px)] md:flex md:flex-col">
              <div className="grid grid-cols-7 mb-1 flex-shrink-0">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div
                    key={i}
                    className="text-center text-[10px] font-pixel text-brand-400 dark:text-brand-500 py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:flex-1 md:grid-rows-6">
                {monthGridDays.map((day) => {
                  const dateStr = toDateStr(day);
                  const isCurrentMonth = day.getMonth() === month;
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const dayOccurrences = occurrencesByDate[dateStr] || [];

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`relative aspect-square md:aspect-auto rounded-lg flex items-center justify-center text-xs transition ${
                        isCurrentMonth
                          ? "text-brand-700 dark:text-brand-100"
                          : "text-brand-200 dark:text-brand-700"
                      } ${
                        isToday
                          ? "bg-brand-500 text-white font-semibold"
                          : isSelected
                          ? "bg-violet-200 dark:bg-violet-800 text-violet-900 dark:text-violet-100 font-semibold ring-2 ring-violet-400 dark:ring-violet-500"
                          : "hover:bg-brand-100 dark:hover:bg-brand-800"
                      }`}
                    >
                      <span>{day.getDate()}</span>
                      {dayOccurrences.length > 0 && (
                        <span className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-0.5">
                          {dayOccurrences.slice(0, 3).map((occ, i) => {
                            const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                            const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                            return color.isCustom ? (
                              <span
                                key={i}
                                className={`w-1 h-1 rounded-full ${isToday ? "ring-1 ring-white" : ""}`}
                                style={color.dotStyle}
                              />
                            ) : (
                              <span
                                key={i}
                                className={`w-1 h-1 rounded-full ${color.dot} ${isToday ? "ring-1 ring-white" : ""}`}
                              />
                            );
                          })}
                        </span>
                      )}
                    </button>
                );
              })}
              </div>
            </div>
          </>
        )}

        {view === "week" && (
          <>
            {/* Unified week nav — controls both calendar events and routine */}
            {(() => {
              // Compute routineWeekOffset from cursorDate so they stay in sync
              const todayStart = new Date();
              todayStart.setDate(todayStart.getDate() - todayStart.getDay());
              todayStart.setHours(0,0,0,0);
              const cursorStart = new Date(cursorDate);
              cursorStart.setDate(cursorStart.getDate() - cursorStart.getDay());
              cursorStart.setHours(0,0,0,0);
              const diffMs = cursorStart - todayStart;
              const computedOffset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
              const atMin = computedOffset <= -2;
              const atMax = computedOffset >= 2;
              const isCurrentWeek = computedOffset === 0;

              const prevWeek = () => { if (!atMin) { goToPrevWeek(); setRoutineWeekOffset(o => o - 1); } };
              const nextWeek = () => { if (!atMax) { goToNextWeek(); setRoutineWeekOffset(o => o + 1); } };
              const backToNow = () => { goToToday(); setRoutineWeekOffset(0); };

              return (
                <div className="flex items-center justify-between mb-2">
                  <button onClick={prevWeek} disabled={atMin}
                    className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg disabled:opacity-30 text-lg">
                    &#8249;
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-medium text-brand-700 dark:text-brand-100">
                      {formatWeekRangeLabel(weekDays)}
                    </span>
                    {!isCurrentWeek && (
                      <button onClick={backToNow} className="text-[10px] text-accent-500 dark:text-accent-300 hover:underline mt-0.5">
                        Back to this week
                      </button>
                    )}
                  </div>
                  <button onClick={nextWeek} disabled={atMax}
                    className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg disabled:opacity-30 text-lg">
                    &#8250;
                  </button>
                </div>
              );
            })()}

            {/* Day-of-week strip */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {weekDays.map((day) => {
                const dateStr = toDateStr(day);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dayOccurrences = weekOccurrencesByDate[dateStr] || [];
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative flex flex-col items-center gap-1 py-2 pb-3 rounded-lg transition ${
                      isToday
                        ? "bg-brand-500 text-white font-semibold"
                        : isSelected
                        ? "bg-violet-200 dark:bg-violet-800 text-violet-900 dark:text-violet-100 font-semibold ring-2 ring-violet-400 dark:ring-violet-500"
                        : "text-brand-700 dark:text-brand-100 hover:bg-brand-100 dark:hover:bg-brand-800"
                    }`}
                  >
                    <span className="text-[9px] font-pixel opacity-80">
                      {WEEKDAY_LABELS[day.getDay()]}
                    </span>
                    <span className="text-sm">{day.getDate()}</span>
                    {dayOccurrences.length > 0 && (
                      <span className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
                        {dayOccurrences.slice(0, 3).map((occ, i) => {
                          const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                          const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                          return color.isCustom ? (
                            <span key={i} className={`w-1 h-1 rounded-full ${isToday ? "ring-1 ring-white" : ""}`} style={color.dotStyle} />
                          ) : (
                            <span key={i} className={`w-1 h-1 rounded-full ${color.dot} ${isToday ? "ring-1 ring-white" : ""}`} />
                          );
                        })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── ROUTINE SECTION ── */}
            {(() => {
              function startOfWeekLocal(date) {
                const d = new Date(date);
                d.setDate(d.getDate() - d.getDay());
                d.setHours(0,0,0,0);
                return d;
              }
              function addWeeksLocal(date, n) {
                const d = new Date(date);
                d.setDate(d.getDate() + n * 7);
                return d;
              }
              const todayWeekStart = startOfWeekLocal(new Date());
              const viewedWeekStart = addWeeksLocal(todayWeekStart, routineWeekOffset);

              return (
                <div className="mb-6 space-y-4">
                  {/* Manage blocks (left) + Reset fixed blocks (right) */}
                  <div className="flex items-center justify-between text-xs font-medium">
                    <button onClick={() => setShowLibrary(s => !s)} className="text-accent-500 dark:text-accent-300">
                      {showLibrary ? "Hide blocks" : "Manage blocks"}
                    </button>
                    <button onClick={() => routineResetRef.current?.()} className="text-accent-500 dark:text-accent-300">
                      Reset fixed blocks
                    </button>
                  </div>

                  {showLibrary && (
                    <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm p-3">
                      <BlockLibraryManager />
                    </div>
                  )}

                  {/* Routine week grid — DRAG TO PLACE palette is inside */}
                  <RoutineWeekView weekStartDate={viewedWeekStart} onResetRef={routineResetRef} />

                </div>
              );
            })()}
          </>
        )}
        {view === "day" && (
          <>
            {/* Day nav, reuses selectedDate as the day being viewed */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => {
                  const [y, m, d] = selectedDate.split("-").map(Number);
                  const dt = new Date(y, m - 1, d - 1);
                  setSelectedDate(toDateStr(dt));
                }}
                className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg"
                aria-label="Previous day"
              >
                &#8249;
              </button>
              <span className="text-sm font-medium text-brand-700 dark:text-brand-100">
                {isViewingToday ? "TODAY" : formatSelectedDateLabel(selectedDate)}
              </span>
              <button
                onClick={() => {
                  const [y, m, d] = selectedDate.split("-").map(Number);
                  const dt = new Date(y, m - 1, d + 1);
                  setSelectedDate(toDateStr(dt));
                }}
                className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg"
                aria-label="Next day"
              >
                &#8250;
              </button>
            </div>

            {/* All-day events, shown above the timeline since they have no time slot */}
            {dayAllDayEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {dayAllDayEvents.map((occ) => {
                  const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                  const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                  return (
                    <button
                      key={`${occ.id}-${occ.occurrenceDate}`}
                      onClick={() => setSelectedOccurrence(occ)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                        color.isCustom ? "" : color.badge
                      }`}
                      style={color.isCustom ? color.badgeStyle : undefined}
                    >
                      <ColorDot color={color} className="w-1.5 h-1.5" />
                      {occ.title}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 00:00-24:00 timeline, 30-minute rows, scrollable ~4hr window */}
            <div className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-500 bg-white dark:bg-brand-700 overflow-hidden">
              <div
                ref={dayTimelineScrollRef}
                className="overflow-y-auto h-[384px] md:h-[calc(100vh-280px)]"
              >
                <div className="relative" style={{ height: `${48 * 32 + 24 + 32}px` }}>
                  {/* Half-hour gridlines + hour labels, offset down 24px so the
                      first label isn't flush against the scroll edge */}
                  {Array.from({ length: 48 }).map((_, slot) => {
                    const isHourMark = slot % 2 === 0;
                    const hour = Math.floor(slot / 2);
                    const label =
                      hour === 0
                        ? "12am"
                        : hour < 12
                        ? `${hour}am`
                        : hour === 12
                        ? "12pm"
                        : `${hour - 12}pm`;
                    return (
                      <div
                        key={slot}
                        className={`absolute left-0 right-0 border-t ${
                          isHourMark
                            ? "border-brand-200 dark:border-brand-600"
                            : "border-brand-50 dark:border-brand-800"
                        }`}
                        style={{ top: `${24 + slot * 32}px` }}
                      >
                        {isHourMark && (
                          <button
                            onClick={() => {
                              setAddModalStartTime(`${String(hour).padStart(2, "0")}:00`);
                              setShowAddModal(true);
                            }}
                            className="absolute -top-2 left-1.5 z-10 text-[9px] text-brand-300 dark:text-brand-500 bg-white dark:bg-brand-700 px-0.5 hover:text-accent-500 dark:hover:text-accent-300"
                          >
                            {label}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Closing boundary line at 24:00 / midnight, with extra
                      bottom padding below it so it isn't flush with the
                      scroll container's edge. */}
                  <div
                    className="absolute left-0 right-0 border-t border-brand-200 dark:border-brand-600"
                    style={{ top: `${24 + 48 * 32}px` }}
                  >
                    <span className="absolute -top-2 left-1.5 text-[9px] text-brand-300 dark:text-brand-500 bg-white dark:bg-brand-700 px-0.5">
                      12am
                    </span>
                  </div>

                  {/* Current-time indicator, only shown when viewing today */}
                  {isViewingToday && (
                    <div
                      className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
                      style={{
                        top: `${24 +
                          (timeToMinutes(
                            `${String(new Date().getHours()).padStart(2, "0")}:${String(
                              new Date().getMinutes()
                            ).padStart(2, "0")}`
                          ) /
                            30) *
                            32}px`,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full bg-accent-500 dark:bg-accent-300 -ml-1" />
                      <span className="flex-1 h-px bg-accent-500 dark:bg-accent-300" />
                    </div>
                  )}

                  {/* Timed event blocks, positioned by start time and sized by duration.
                      Starts at left-14 (not inset-0+padding) so it never visually
                      or functionally overlaps the hour-label gutter on the left. */}
                  <div className="absolute top-0 bottom-0 left-14 right-2">
                    {dayTimedLayout.map((occ) => {
                      const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                      const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                      const top = 24 + (occ._start / 30) * 32 + 5;
                      const height = ((occ._end - occ._start) / 30) * 32;
                      const widthPercent = 100 / occ.columnCount;

                      return (
                        <button
                          key={`${occ.id}-${occ.occurrenceDate}`}
                          onClick={() => setSelectedOccurrence(occ)}
                          className={`absolute rounded-lg px-2 py-1 text-left overflow-hidden ${
                            color.isCustom ? "" : color.badge
                          } border border-white/50 dark:border-black/20`}
                          style={{
                            top: `${top}px`,
                            height: `${Math.max(height - 7, 18)}px`,
                            left: `${occ._column * widthPercent}%`,
                            width: `${widthPercent - 1}%`,
                            ...(color.isCustom ? color.badgeStyle : {}),
                          }}
                        >
                          <span className="text-[10px] font-medium block truncate leading-tight">
                            {occ.title}
                          </span>
                          {height > 28 && (
                            <span className="text-[9px] opacity-75 block truncate leading-tight">
                              {formatTimeShort(occ.startTime)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {view === "list" && (
          <>
          <div className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-500 bg-white dark:bg-brand-700 overflow-hidden h-[384px] md:h-[calc(100vh-280px)] flex flex-col">
            {upcomingListOccurrences.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <PixelLantern className="w-6 h-8 opacity-60" />
                <p className="text-sm text-brand-300 dark:text-brand-300 italic">No upcoming events.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-brand-50 dark:divide-brand-600">
                {upcomingListOccurrences.map((occ) => {
                  const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                  const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                  const occYear = Number(occ.occurrenceDate.slice(0, 4));
                  const currentYear = new Date().getFullYear();
                  const dateLabel = new Date(
                    ...occ.occurrenceDate.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))
                  ).toLocaleDateString(undefined,
                    occYear !== currentYear
                      ? { year: "numeric", month: "short", day: "numeric" }
                      : { month: "short", day: "numeric" }
                  );
                  return (
                    <button
                      key={`${occ.id}-${occ.occurrenceDate}`}
                      onClick={() => setSelectedOccurrence(occ)}
                      className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-700 transition"
                    >
                      <ColorDot color={color} className="w-2 h-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-brand-800 dark:text-brand-100 truncate block">{occ.title}</span>
                        <span className="text-xs text-brand-400 dark:text-brand-400">{dateLabel}</span>
                      </div>
                      <span className="text-xs text-brand-400 dark:text-brand-400 flex-shrink-0">
                        {occ.allDay ? "All day" : formatTimeShort(occ.startTime)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Events — outside the box, collapsible by month */}
          {pastListByMonth.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPastEvents((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-800 border border-brand-100 dark:border-brand-700 text-xs text-brand-500 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-700 transition"
              >
                <span className="flex items-center gap-1.5">
                  <span>🗂️</span>
                  <span className="font-medium">Past Events</span>
                  <span className="text-brand-300 dark:text-brand-600">
                    — {pastListOccurrences.length} event{pastListOccurrences.length !== 1 ? "s" : ""}
                  </span>
                </span>
                <span>{showPastEvents ? "▲" : "▼"}</span>
              </button>

              {showPastEvents && (
                <div className="mt-2 space-y-2">
                  {pastListByMonth.map(({ key, label, occurrences }) => (
                    <div key={key} className="rounded-xl border border-brand-100 dark:border-brand-700 overflow-hidden">
                      <button
                        onClick={() => setOpenPastMonths((p) => ({ ...p, [key]: !p[key] }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-brand-50 dark:bg-brand-900 hover:bg-brand-100 dark:hover:bg-brand-800 transition text-xs"
                      >
                        <span className="font-medium text-brand-600 dark:text-brand-300">{label}</span>
                        <span className="flex items-center gap-2 text-brand-400 dark:text-brand-500">
                          <span>{occurrences.length} event{occurrences.length !== 1 ? "s" : ""}</span>
                          <span>{openPastMonths[key] ? "▲" : "▼"}</span>
                        </span>
                      </button>
                      {openPastMonths[key] && (
                        <div className="divide-y divide-brand-50 dark:divide-brand-700 bg-white dark:bg-brand-800">
                          {occurrences.map((occ) => {
                            const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                            const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                            const occYear = Number(occ.occurrenceDate.slice(0, 4));
                            const currentYear = new Date().getFullYear();
                            const dateLabel = new Date(
                              ...occ.occurrenceDate.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))
                            ).toLocaleDateString(undefined,
                              occYear !== currentYear
                                ? { year: "numeric", month: "short", day: "numeric" }
                                : { month: "short", day: "numeric" }
                            );
                            return (
                              <button
                                key={`${occ.id}-${occ.occurrenceDate}`}
                                onClick={() => setSelectedOccurrence(occ)}
                                className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-700 transition opacity-70"
                              >
                                <ColorDot color={color} className="w-2 h-2 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-brand-800 dark:text-brand-100 truncate block">{occ.title}</span>
                                  <span className="text-xs text-brand-400 dark:text-brand-400">{dateLabel}</span>
                                </div>
                                <span className="text-xs text-brand-400 dark:text-brand-400 flex-shrink-0">
                                  {occ.allDay ? "All day" : formatTimeShort(occ.startTime)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
        )}

          </div>
          {/* ---------- LEFT column ends here ---------- */}

          {/* ---------- RIGHT: Selected day panel + Upcoming, stacked, splitting height evenly to match the left column ---------- */}
          <div className="md:flex-1 md:flex md:flex-col md:gap-6">
        {/* Selected day panel */}
        <div className="mt-6 md:mt-0 md:flex-1 md:flex md:flex-col">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-xs font-pixel text-brand-500 dark:text-brand-400 flex items-center gap-1.5">
              <Sakura className="w-3.5 h-3.5" />
              {isViewingToday ? "TODAY" : formatSelectedDateLabel(selectedDate).toUpperCase()}
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-brand-500 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-100 font-medium"
            >
              + Add event
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-brand-700 border-2 border-brand-200 dark:border-brand-500 overflow-hidden md:flex-1 md:overflow-y-auto">
            {selectedDayOccurrences.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <PixelLantern className="w-6 h-8 opacity-60" />
                <p className="text-sm text-brand-300 dark:text-brand-300 italic">
                  No events on this day.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-brand-50 dark:divide-brand-600">
                {selectedDayOccurrences.map((occ) => {
                  const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                  const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                  return (
                    <button
                      key={`${occ.id}-${occ.occurrenceDate}`}
                      onClick={() => setSelectedOccurrence(occ)}
                      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-brand-50 dark:hover:bg-brand-700 transition"
                    >
                      <ColorDot color={color} className="mt-1.5 w-2 h-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-brand-800 dark:text-brand-100 truncate">
                            {occ.title}
                          </span>
                          <span className="text-xs text-brand-400 dark:text-brand-500 flex-shrink-0">
                            {occ.allDay ? "All day" : formatTimeShort(occ.startTime)}
                          </span>
                        </div>
                        {occ.details && (
                          <p className="text-xs text-brand-400 dark:text-brand-500 mt-0.5 line-clamp-2">
                            {occ.details}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming events list */}
        <div className="mt-6 md:mt-0 md:flex-1 md:flex md:flex-col">
          <h2 className="text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2 px-1 flex items-center gap-1.5">
            <Sakura className="w-3.5 h-3.5" />
            UPCOMING
          </h2>
          <div className="rounded-2xl bg-white dark:bg-brand-700 border-2 border-brand-200 dark:border-brand-500 overflow-visible md:flex-1 md:overflow-y-auto">
            <UpcomingEventsList
              occurrences={upcomingOccurrences}
              categories={categories}
              onSelectEvent={setSelectedOccurrence}
            />
          </div>
        </div>
          </div>
          {/* ---------- RIGHT column ends here ---------- */}
        </div>
      </div>

      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-500 text-white shadow-lg flex items-center justify-center hover:bg-brand-600 z-10 border-2 border-accent-300/60"
        aria-label="Add event"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {showMonthYearPicker && (
        <MonthYearPicker
          currentYear={year}
          currentMonth={month}
          onSelect={(newYear, newMonth) => setCursorDate(new Date(newYear, newMonth, 1))}
          onClose={() => setShowMonthYearPicker(false)}
        />
      )}

      {selectedOccurrence && (
        <EventDetailModal
          occurrence={selectedOccurrence}
          categories={categories}
          onClose={() => setSelectedOccurrence(null)}
        />
      )}

      {showAddModal && uid && (
        <AddEventModal
          uid={uid}
          initialDate={selectedDate}
          initialStartTime={addModalStartTime}
          categories={categories}
          onClose={() => {
            setShowAddModal(false);
            setAddModalStartTime(null);
          }}
        />
      )}
    </PageLayout>
  );
}

export default Calendar;
