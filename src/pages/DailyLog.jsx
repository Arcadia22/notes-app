import { useState, useEffect, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { auth } from "../firebase";
import { db } from "../firebase";
import {
  query, collection, where, onSnapshot,
} from "firebase/firestore";
import {
  listenToLogsInMonth,
  listenToDayLog,
  saveDayLog,
  deleteDayLog,
  vibeScore,
  vibeStyle,
} from "../lib/dailyLog";
import { listenToProjects } from "../lib/projects";
import { listenToEvents, expandEventsInRange } from "../lib/events";
import { listenToBlockDefinitions } from "../lib/routine";
import { listenToHabits, listenToHabitEntries, setHabitEntryStatus, clearHabitEntry } from "../lib/habits";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";
import { isDueOnDay } from "../lib/habitStats";
import { listenToChores, getChoresForWeek } from "../lib/chores";

// ── Helpers ───────────────────────────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - firstOfMonth.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

const MOODS = [
  { value: 1, emoji: "😞", label: "Awful" },
  { value: 2, emoji: "😕", label: "Bad" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

const ENERGIES = [
  { value: 1, emoji: "🪫", label: "Drained" },
  { value: 2, emoji: "😴", label: "Low" },
  { value: 3, emoji: "😌", label: "Steady" },
  { value: 4, emoji: "⚡", label: "Good" },
  { value: 5, emoji: "🔥", label: "High" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Scale picker ──────────────────────────────────────────────────────

function ScalePicker({ items, value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(value === item.value ? null : item.value)}
          className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 transition ${
            value === item.value
              ? "border-accent-400 dark:border-accent-300 bg-accent-50 dark:bg-accent-900/30"
              : "border-brand-100 dark:border-brand-700 hover:border-brand-300 dark:hover:border-brand-500"
          }`}
        >
          <span className="text-2xl leading-none">{item.emoji}</span>
          <span className={`text-[9px] font-medium ${
            value === item.value
              ? "text-accent-600 dark:text-accent-300"
              : "text-brand-400 dark:text-brand-500"
          }`}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Day entry form ────────────────────────────────────────────────────

export function DayEntry({ uid, date, onClose }) {
  const [tab, setTab] = useState("log"); // "log" | "snapshot"
  const [draft, setDraft] = useState({
    mood: null, energy: null,
    highlight: "", dislike: "", remember: "", freeText: "",
    projectProgress: [],
    snapshotChecks: {}, // { [itemKey]: "done" | "partial" | "skipped" }
  });
  const [saving, setSaving] = useState(false);
  const [hasExistingLog, setHasExistingLog] = useState(false);
  const [projects, setProjects] = useState([]);

  // Snapshot data
  const [events, setEvents] = useState([]);
  const [routineBlocks, setRoutineBlocks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitEntries, setHabitEntries] = useState([]);
  const [chores, setChores] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToProjects(uid, setProjects);
    const u2 = listenToEvents(uid, setEvents);
    const u3 = listenToBlockDefinitions(uid, setRoutineBlocks);
    const u4 = listenToHabits(uid, setHabits);
    const u5 = listenToHabitEntries(uid, setHabitEntries);
    const u6 = listenToChores(uid, setChores);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, [uid, date]);

  useEffect(() => {
    return listenToDayLog(uid, date, (existing) => {
      if (existing) {
        setHasExistingLog(true);
        const pp = existing.projectProgress;
        setDraft({
          mood: existing.mood ?? null,
          energy: existing.energy ?? null,
          highlight: existing.highlight || "",
          dislike: existing.dislike || "",
          remember: existing.remember || "",
          freeText: existing.freeText || "",
          projectProgress: Array.isArray(pp)
            ? pp
            : pp ? [{ projectId: "", note: pp }] : [],
          snapshotChecks: existing.snapshotChecks || {},
        });
      }
    });
  }, [uid, date]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDayLog(uid, date, draft);
      // Award XP for writing daily log (once per date)
      awardXp(uid, "daily-log", xpId.dailyLog(date), XP.DAILY_LOG);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Build snapshot items for the day
  const dateObj = new Date(date + "T00:00:00");
  const dateLabel = dateObj.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const dayEvents = useMemo(() => {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59");
    return expandEventsInRange(events, start, end);
  }, [events, date]);

  const dayRoutine = useMemo(() => {
    const dow = dateObj.getDay(); // 0=Sun
    return routineBlocks.filter(b => {
      if (!b.days) return false;
      const dayMap = ["sun","mon","tue","wed","thu","fri","sat"];
      return b.days.includes(dayMap[dow]);
    }).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [routineBlocks, date]);

  const dayHabits = useMemo(() => {
    const dow = dateObj.getDay(); // 0=Sun..6=Sat
    return habits.filter(h =>
      h.trackType !== "timed" &&
      h.trackType !== "monthly" &&
      isDueOnDay(h, dow)
    );
  }, [habits, date]);

  const dayChores = useMemo(() => {
    const all = getChoresForWeek(chores);
    return all.filter(({ dueDate }) => dueDate === date || dueDate === "overdue");
  }, [chores, date]);

  const cycleCheck = (key) => {
    const current = draft.snapshotChecks[key];
    const next = !current ? "done" : current === "done" ? "partial" : current === "partial" ? "skipped" : null;
    setDraft(d => ({
      ...d,
      snapshotChecks: next === null
        ? Object.fromEntries(Object.entries(d.snapshotChecks).filter(([k]) => k !== key))
        : { ...d.snapshotChecks, [key]: next },
    }));
  };

  const CheckBox = ({ itemKey, label, sub }) => {
    const state = draft.snapshotChecks[itemKey];
    return (
      <div className="flex items-start gap-2.5 py-1">
        <button onClick={() => cycleCheck(itemKey)}
          className={`flex-shrink-0 mt-[3px] w-4 h-4 rounded border-2 flex items-center justify-center transition text-[10px] font-bold ${
            state === "done"    ? "bg-emerald-500 border-emerald-500 text-white" :
            state === "partial" ? "bg-amber-400 border-amber-400 text-white" :
            state === "skipped" ? "bg-red-400 border-red-400 text-white" :
            "border-brand-300 dark:border-brand-600 hover:border-brand-500"
          }`}>
          {state === "done" && "✓"}
          {state === "partial" && "~"}
          {state === "skipped" && "✗"}
        </button>
        <div className="min-w-0">
          <p className={`text-sm leading-snug ${
            state === "done" ? "line-through text-brand-400" :
            state === "skipped" ? "line-through text-red-400 dark:text-red-500" :
            "text-brand-700 dark:text-brand-200"
          }`}>{label}</p>
          {sub && <p className="text-[10px] text-brand-400 dark:text-brand-500">{sub}</p>}
        </div>
      </div>
    );
  };

  const score = vibeScore({ mood: draft.mood, energy: draft.energy });
  const vibe = vibeStyle(score);

  const field = (key, placeholder, rows = 2) => (
    <textarea
      value={draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-brand-950">
      {/* Sticky header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 bg-white dark:bg-brand-900 border-b border-brand-100 dark:border-brand-700"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", paddingBottom: "0.75rem" }}>
        <div>
          <p className="text-[10px] text-brand-400 font-pixel">DAILY LOG</p>
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {vibe && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${vibe.bg} text-brand-700 dark:text-white`}>
              {vibe.label}
            </span>
          )}
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="text-brand-400 text-2xl leading-none">&times;</button>
        </div>
      </div>

      {/* Tab switcher — always visible */}
      <div className="flex-shrink-0 flex gap-1 px-4 py-2 bg-white dark:bg-brand-900 border-b border-brand-100 dark:border-brand-700">
        <button onClick={() => setTab("log")}
          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition ${tab === "log" ? "bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100" : "text-brand-400 dark:text-brand-500"}`}>
          📝 Log
        </button>
        <button onClick={() => setTab("snapshot")}
          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition ${tab === "snapshot" ? "bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100" : "text-brand-400 dark:text-brand-500"}`}>
          📅 Day Snapshot
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">

      {/* ── LOG ENTRY TAB ── */}
      {tab === "log" && (
      <div className="max-w-lg mx-auto w-full px-4 py-6 space-y-8">
        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-3">MOOD</label>
          <ScalePicker items={MOODS} value={draft.mood} onChange={(v) => setDraft((d) => ({ ...d, mood: v }))} />
        </section>

        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-3">ENERGY</label>
          <ScalePicker items={ENERGIES} value={draft.energy} onChange={(v) => setDraft((d) => ({ ...d, energy: v }))} />
        </section>

        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">✨ BEST PART OF THE DAY</label>
          {field("highlight", "What made today worthwhile?")}
        </section>

        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">😮‍💨 COULD HAVE DONE WITHOUT</label>
          {field("dislike", "What dragged the day down?")}
        </section>

        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">🔖 SOMETHING TO REMEMBER</label>
          {field("remember", "A thought, lesson, or moment to keep.")}
        </section>

        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">🚀 PROJECTS PROGRESS</label>

          {/* Existing entries */}
          <div className="space-y-2 mb-2">
            {draft.projectProgress.map((entry, idx) => (
              <div key={idx} className="rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-800 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={entry.projectId}
                    onChange={e => {
                      const updated = [...draft.projectProgress];
                      updated[idx] = { ...entry, projectId: e.target.value };
                      setDraft(d => ({ ...d, projectProgress: updated }));
                    }}
                    className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none"
                  >
                    <option value="">— No project —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setDraft(d => ({
                      ...d,
                      projectProgress: d.projectProgress.filter((_, i) => i !== idx),
                    }))}
                    className="text-brand-300 hover:text-red-400 text-lg leading-none flex-shrink-0"
                  >×</button>
                </div>
                <textarea
                  value={entry.note}
                  onChange={e => {
                    const updated = [...draft.projectProgress];
                    updated[idx] = { ...entry, note: e.target.value };
                    setDraft(d => ({ ...d, projectProgress: updated }));
                  }}
                  placeholder="What did you move forward on this project?"
                  rows={2}
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-400"
                />
              </div>
            ))}
          </div>

          {/* Add entry button */}
          <button
            onClick={() => setDraft(d => ({
              ...d,
              projectProgress: [...d.projectProgress, { projectId: "", note: "" }],
            }))}
            className="text-xs text-accent-500 dark:text-accent-300 font-medium"
          >
            + Add project progress
          </button>
        </section>

        <section>
          <label className="block text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">📓 FREE WRITE</label>
          {field("freeText", "Anything else on your mind…", 6)}
        </section>

        {hasExistingLog && (
          <section className="pt-2 border-t border-brand-100 dark:border-brand-700">
            <button
              onClick={async () => {
                if (!confirm("Delete this log entry? This cannot be undone.")) return;
                await deleteDayLog(uid, date);
                onClose();
              }}
              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 font-medium transition"
            >
              Delete this log entry
            </button>
          </section>
        )}

        <p className="text-[10px] text-center text-brand-300 dark:text-brand-600 italic pb-6">
          Your entries are private and stored securely.
        </p>
      </div>
      )} {/* end log tab */}

      {/* ── DAY SNAPSHOT TAB ── */}
      {tab === "snapshot" && (
        <div className="max-w-lg mx-auto w-full px-4 py-6 space-y-6">
          <p className="text-[10px] text-brand-400 dark:text-brand-500 italic">
            Tap each item to cycle: ✓ done → ~ partial → ✗ skipped → unchecked
          </p>

          {/* Events */}
          {dayEvents.length > 0 && (
            <section>
              <p className="text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">📅 EVENTS</p>
              {dayEvents.map(ev => (
                <CheckBox key={`event-${ev.id}-${ev.occurrenceDate}`}
                  itemKey={`event-${ev.id}`}
                  label={ev.title}
                  sub={ev.startTime ? `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ""}` : "All day"} />
              ))}
            </section>
          )}

          {/* Routine */}
          {dayRoutine.length > 0 && (
            <section>
              <p className="text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">🌅 ROUTINE</p>
              {dayRoutine.map(block => (
                <CheckBox key={`routine-${block.id}`}
                  itemKey={`routine-${block.id}`}
                  label={block.title || block.name}
                  sub={block.startTime ? `${block.startTime}${block.endTime ? ` – ${block.endTime}` : ""}` : null} />
              ))}
            </section>
          )}

          {/* Habits — only daily/weekly, synced with tracker */}
          {dayHabits.length > 0 && (
            <section>
              <p className="text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">🎯 HABITS</p>
              {dayHabits.map(habit => {
                const entry = habitEntries.find(e => e.habitId === habit.id && e.date === date);
                const status = entry?.status; // "done" | "failed" | undefined

                const toggle = async () => {
                  if (!status) {
                    // Unmarked → done: award XP, remove failed penalty if any
                    await setHabitEntryStatus(uid, habit.id, date, "done");
                    revokeXp(uid, xpId.habitFailed(habit.id, date));
                    awardXp(uid, "habit", xpId.habitDone(habit.id, date), XP.HABIT_DONE);
                  } else if (status === "done") {
                    // Done → failed: revoke done XP, apply failed penalty
                    if (entry?.id) await clearHabitEntry(entry.id);
                    await setHabitEntryStatus(uid, habit.id, date, "failed");
                    revokeXp(uid, xpId.habitDone(habit.id, date));
                    awardXp(uid, "habit-failed", xpId.habitFailed(habit.id, date), XP.HABIT_FAILED);
                  } else {
                    // Failed → clear: revoke penalty
                    if (entry?.id) await clearHabitEntry(entry.id);
                    revokeXp(uid, xpId.habitFailed(habit.id, date));
                  }
                };

                return (
                  <div key={habit.id} className="flex items-start gap-2.5 py-1">
                    <button onClick={toggle}
                      className={`flex-shrink-0 mt-[3px] w-4 h-4 rounded border-2 flex items-center justify-center transition text-[10px] font-bold ${
                        status === "done"   ? "bg-emerald-500 border-emerald-500 text-white" :
                        status === "failed" ? "bg-red-400 border-red-400 text-white" :
                        "border-brand-300 dark:border-brand-600 hover:border-brand-500"
                      }`}>
                      {status === "done" && "✓"}
                      {status === "failed" && "✗"}
                    </button>
                    <p className={`text-sm leading-snug ${
                      status === "done" ? "line-through text-brand-400" :
                      status === "failed" ? "line-through text-red-400 dark:text-red-500" :
                      "text-brand-700 dark:text-brand-200"
                    }`}>{habit.name}</p>
                  </div>
                );
              })}
              <p className="text-[10px] text-brand-300 dark:text-brand-600 mt-1.5 italic">Tap to mark done ✓ → failed ✗ → clear</p>
            </section>
          )}

          {/* Chores */}
          {dayChores.length > 0 && (
            <section>
              <p className="text-xs font-pixel text-brand-500 dark:text-brand-400 mb-2">🧹 CHORES</p>
              {dayChores.map(({ chore }) => (
                <CheckBox key={`chore-${chore.id}`}
                  itemKey={`chore-${chore.id}`}
                  label={chore.name}
                  sub={chore.category || null} />
              ))}
            </section>
          )}

          {dayEvents.length === 0 && dayRoutine.length === 0 && dayHabits.length === 0 && dayChores.length === 0 && (
            <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-8">Nothing scheduled for this day.</p>
          )}
        </div>
      )}

      </div> {/* end scrollable area */}
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────

function DailyLogCalendar({ uid }) {
  const today = new Date();
  const todayStr = toDateStr(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [logs, setLogs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    return listenToLogsInMonth(uid, year, month, setLogs);
  }, [uid, year, month]);

  const logsByDate = useMemo(() => {
    const map = {};
    for (const log of logs) map[log.date] = log;
    return map;
  }, [logs]);

  const gridDays = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long", year: "numeric",
  });

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  return (
    <>
      {selectedDate && (
        <DayEntry uid={uid} date={selectedDate} onClose={() => setSelectedDate(null)} />
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-700">‹</button>
          <h2 className="text-sm font-pixel text-brand-700 dark:text-brand-200">{monthLabel.toUpperCase()}</h2>
          <button onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-700">›</button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[9px] font-medium text-brand-400 dark:text-brand-600 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((day) => {
            const dateStr = toDateStr(day);
            const isCurrentMonth = day.getMonth() === month;
            const isToday = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            const log = logsByDate[dateStr];
            const score = vibeScore(log);
            const vibe = vibeStyle(score);

            return (
              <button
                key={dateStr}
                onClick={() => !isFuture && isCurrentMonth && setSelectedDate(dateStr)}
                disabled={isFuture || !isCurrentMonth}
                className={`
                  relative aspect-square rounded-xl flex items-center justify-center
                  transition text-xs select-none
                  ${!isCurrentMonth ? "opacity-20 cursor-default" : ""}
                  ${isFuture && isCurrentMonth ? "cursor-default opacity-30" : ""}
                  ${isCurrentMonth && !isFuture ? "cursor-pointer" : ""}
                  ${isToday ? "ring-2 ring-offset-1 ring-accent-400 dark:ring-accent-300 dark:ring-offset-brand-950" : ""}
                  ${vibe ? vibe.bg : (isCurrentMonth && !isFuture ? "hover:bg-brand-100 dark:hover:bg-brand-800" : "")}
                `}
              >
                {/* Number — always centered */}
                <span className={`text-xs font-medium leading-none ${
                  vibe ? "text-brand-700 dark:text-white" :
                  isCurrentMonth ? "text-brand-600 dark:text-brand-300" : ""
                }`}>{day.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-5 flex flex-wrap gap-x-3 gap-y-1.5 justify-center">
          {[
            { label: "Amazing", bg: "bg-orange-300 dark:bg-orange-500" },
            { label: "Good",    bg: "bg-lime-200 dark:bg-lime-700" },
            { label: "Okay",    bg: "bg-emerald-100 dark:bg-emerald-800" },
            { label: "Meh",     bg: "bg-sky-100 dark:bg-sky-900" },
            { label: "Low",     bg: "bg-indigo-100 dark:bg-indigo-900" },
            { label: "Rough",   bg: "bg-slate-200 dark:bg-slate-700" },
          ].map(({ label, bg }) => (
            <span key={label} className="flex items-center gap-1 text-[10px] text-brand-400 dark:text-brand-500">
              <span className={`w-3 h-3 rounded-sm ${bg}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Recent entries ────────────────────────────────────────────────────

function RecentEntry({ log, onClick }) {
  const score = vibeScore(log);
  const vibe = vibeStyle(score);
  const dateObj = new Date(log.date + "T00:00:00");
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
  const moodEmoji = MOODS.find((m) => m.value === log.mood)?.emoji;
  const energyEmoji = ENERGIES.find((e) => e.value === log.energy)?.emoji;
  const preview = log.highlight || log.remember || log.freeText;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 p-3 transition hover:border-accent-300 dark:hover:border-accent-400 ${
        vibe ? `${vibe.bg} border-transparent` : "border-brand-100 dark:border-brand-700 bg-white dark:bg-brand-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-200">{dateLabel}</span>
            {vibe && <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-white/50 dark:bg-black/20 text-brand-600 dark:text-white`}>{vibe.label}</span>}
          </div>
          {preview && (
            <p className="text-xs text-brand-500 dark:text-brand-400 truncate">
              {log.highlight ? `✨ ${log.highlight}` : log.remember ? `🔖 ${log.remember}` : log.freeText}
            </p>
          )}
        </div>
        <div className="flex gap-0.5 text-base flex-shrink-0 mt-0.5">
          {moodEmoji && <span title="Mood">{moodEmoji}</span>}
          {energyEmoji && <span title="Energy">{energyEmoji}</span>}
        </div>
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

function DailyLog() {
  const uid = auth.currentUser?.uid;
  const [view, setView] = useState("calendar");
  const [todayOpen, setTodayOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [hasLogToday, setHasLogToday] = useState(false);

  const today = new Date();
  const todayStr = toDateStr(today);

  // Track whether today has been logged to show green button
  useEffect(() => {
    if (!uid) return;
    return listenToDayLog(uid, todayStr, (log) => {
      setHasLogToday(!!(log && (log.mood || log.energy || log.highlight || log.freeText || log.remember || log.dislike)));
    });
  }, [uid, todayStr]);

  useEffect(() => {
    if (!uid) return;
    const now = new Date();
    const past = new Date(now);
    past.setDate(past.getDate() - 60);
    const startStr = toDateStr(past);
    const q = query(
      collection(db, "dailyLogs"),
      where("uid", "==", uid),
      where("date", ">=", startStr),
      where("date", "<=", todayStr)
    );
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      logs.sort((a, b) => b.date.localeCompare(a.date));
      setRecentLogs(logs);
    });
  }, [uid]);

  if (!uid) return null;

  return (
    <PageLayout title="Daily Log">
      {todayOpen && (
        <DayEntry uid={uid} date={todayStr} onClose={() => setTodayOpen(false)} />
      )}
      {selectedDate && (
        <DayEntry uid={uid} date={selectedDate} onClose={() => setSelectedDate(null)} />
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        {/* Today button — turns green when logged */}
        <button
          onClick={() => setTodayOpen(true)}
          className={`w-full flex items-center justify-between px-4 py-3 mb-5 rounded-2xl border-2 shadow-sm transition font-pixel ${
            hasLogToday
              ? "bg-emerald-500 dark:bg-emerald-700 border-emerald-400 dark:border-emerald-600 text-white"
              : "bg-brand-700 dark:bg-brand-800 border-accent-400 dark:border-accent-500 text-white hover:bg-brand-600 dark:hover:bg-brand-700"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{hasLogToday ? "✓" : "📓"}</span>
            <div className="text-left">
              <p className="text-[11px] font-pixel tracking-wide">
                {hasLogToday ? "DAY LOGGED!" : "WRITE TODAY'S LOG"}
              </p>
              <p className="text-[9px] opacity-70 font-pixel mt-0.5">
                {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <span className="text-lg opacity-60">{hasLogToday ? "✎" : "›"}</span>
        </button>

        {/* View toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800 mb-5">
          {[["calendar", "📅 Calendar"], ["recent", "📋 Recent"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex-1 text-xs py-1.5 rounded-lg transition font-medium ${
                view === id
                  ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm"
                  : "text-brand-400 dark:text-brand-500 hover:text-brand-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "calendar" && <DailyLogCalendar uid={uid} />}

        {view === "recent" && (
          <div className="space-y-2">
            {recentLogs.length === 0 ? (
              <p className="text-center text-sm text-brand-300 dark:text-brand-600 italic py-10">
                No logs yet — start by writing today's entry.
              </p>
            ) : (
              recentLogs.map((log) => (
                <RecentEntry key={log.id} log={log} onClick={() => setSelectedDate(log.date)} />
              ))
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default DailyLog;
