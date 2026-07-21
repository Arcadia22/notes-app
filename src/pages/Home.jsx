import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppSettings } from "../context/AppSettingsContext";
import { Sakura, ToriiDivider, PixelCloud, Sparkle, PixelPips, PixelStar } from "../components/Decorations";
import { auth } from "../firebase";
import { listenToEvents, listenToCategories, expandEventsInRange, toDateStr } from "../lib/events";
import { getCategoryColor } from "../lib/categoryColors";
import { listenToBlockDefinitions, listenToRoutineWeek } from "../lib/routine";
import { listenToHabits, listenToHabitEntries } from "../lib/habits";
import { isDueOnDay } from "../lib/habitStats";
import { listenToReminders, updateReminder, sortReminders, getTodaysReminders } from "../lib/reminders";
import { listenToChores, toggleChoreComplete, getChoresForWeek, localDateStr } from "../lib/chores";
import { listenToDayLog } from "../lib/dailyLog";
import { DayEntry } from "./DailyLog";
import { listenToProjects } from "../lib/projects";
import { listenToAllProjectTodos, updateProjectTodo, sortTodos } from "../lib/projects";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";

import { getRank, xpForLevel } from "../context/AppSettingsContext";


function SectionHeader({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 text-sm font-pixel text-brand-800 dark:text-brand-100 mb-3 hover:text-brand-600 dark:hover:text-brand-300"
    >
      <Sakura className="w-4 h-4 text-brand-400 dark:text-brand-300 flex-shrink-0" />
      {children}
    </Link>
  );
}

function EmptyState({ text }) {
  return (
    <p className="text-sm text-brand-300 dark:text-brand-500 italic mb-6 pl-6">{text}</p>
  );
}

function formatTimeShort(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

function UpcomingEvents() {
  const uid = auth.currentUser?.uid;
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const unsubEvents = listenToEvents(uid, setEvents);
    const unsubCategories = listenToCategories(uid, setCategories);
    return () => {
      unsubEvents();
      unsubCategories();
    };
  }, [uid]);

  const todayStr = toDateStr(new Date());

  // The rest of the current week (Sunday-start), from today through
  // Saturday — days that already passed are excluded entirely.
  const weekGroups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + (6 - today.getDay()));

    const occurrences = expandEventsInRange(events, today, weekEnd);

    const byDate = {};
    for (const occ of occurrences) {
      // Today's timed events already appear in the Routine section above —
      // showing them here too would duplicate them. Today's all-day events
      // have no slot in the routine, so they still belong here. Future
      // days show everything as normal.
      const isToday = occ.occurrenceDate === todayStr;
      const isTimedToday = isToday && !occ.allDay && occ.startTime;
      if (isTimedToday) continue;

      if (!byDate[occ.occurrenceDate]) byDate[occ.occurrenceDate] = [];
      byDate[occ.occurrenceDate].push(occ);
    }

    // Sort each day's events: timed first (by time), all-day last —
    // same convention used elsewhere on Today.
    for (const dateStr in byDate) {
      byDate[dateStr].sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? 1 : -1;
        return (a.startTime || "").localeCompare(b.startTime || "");
      });
    }

    return Object.keys(byDate)
      .sort()
      .map((dateStr) => ({ dateStr, occurrences: byDate[dateStr] }));
  }, [events, todayStr]);

  if (weekGroups.length === 0) {
    return <EmptyState text="No events this week." />;
  }

  return (
    <div className="mb-6">
      {weekGroups.map(({ dateStr, occurrences }) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const isToday = dateStr === todayStr;
        const dateLabel = isToday
          ? "Today"
          : dateObj.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

        return (
          <div key={dateStr} className="mb-3 last:mb-0">
            <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 pl-6 mb-1">
              {dateLabel.toUpperCase()}
            </p>
            <ul className="space-y-1.5">
              {occurrences.map((occ) => {
                const matchedCategory = categories.find((c) => c.id === occ.categoryId);
                const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
                return (
                  <li key={`${occ.id}-${occ.occurrenceDate}`}>
                    <Link
                      to={`/calendar?date=${dateStr}&event=${occ.id}`}
                      className="flex items-center gap-2 pl-6 py-0.5 text-brand-700 dark:text-brand-200 hover:text-brand-600 dark:hover:text-brand-300"
                    >
                      {color.isCustom ? (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={color.dotStyle} />
                      ) : (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color.dot}`} />
                      )}
                      <span className="flex-1 truncate">{occ.title}</span>
                      <span className="text-brand-400 dark:text-brand-400 text-xs flex-shrink-0">
                        {occ.allDay
                          ? "All day"
                          : occ.endTime
                          ? `${formatTimeShort(occ.startTime)} – ${formatTimeShort(occ.endTime)}`
                          : formatTimeShort(occ.startTime)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function startOfWeekLocal(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function TodayRoutine() {
  const uid = auth.currentUser?.uid;
  const [blockDefs, setBlockDefs] = useState([]);
  const [savedWeek, setSavedWeek] = useState(null);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);

  const todayDate = new Date();
  const todayDayOfWeek = todayDate.getDay();
  const weekStartStr = toDateStr(startOfWeekLocal(todayDate));
  const todayStr = toDateStr(todayDate);

  useEffect(() => {
    if (!uid) return;
    const unsubDefs = listenToBlockDefinitions(uid, setBlockDefs);
    const unsubWeek = listenToRoutineWeek(uid, weekStartStr, setSavedWeek);
    const unsubEvents = listenToEvents(uid, setEvents);
    const unsubCategories = listenToCategories(uid, setCategories);
    return () => {
      unsubDefs();
      unsubWeek();
      unsubEvents();
      unsubCategories();
    };
  }, [uid, weekStartStr]);

  // Same fallback logic as RoutineWeekView: if this week has never been
  // saved, fall back to fixed blocks straight from the library so Today
  // still shows something sensible before the person has touched Routine.
  const todaysRoutineBlocks = useMemo(() => {
    if (!savedWeek) return [];

    let placed;
    if (savedWeek.placedBlocks && savedWeek.placedBlocks.length > 0) {
      placed = savedWeek.placedBlocks;
    } else if (savedWeek.everSaved) {
      placed = [];
    } else {
      placed = [];
      const fixedDefs = blockDefs.filter((b) => b.type === "fixed");
      for (const def of fixedDefs) {
        for (const day of def.defaultDaysOfWeek || []) {
          placed.push({ blockDefId: def.id, dayOfWeek: day, startTime: def.defaultStartTime, endTime: def.defaultEndTime });
        }
      }
    }

    return placed
      .filter((p) => p.dayOfWeek === todayDayOfWeek)
      .map((p) => {
        const def = blockDefs.find((b) => b.id === p.blockDefId);
        return def
          ? { source: "routine", name: def.name, color: def.color, customColor: def.customColor, startTime: p.startTime, endTime: p.endTime }
          : null;
      })
      .filter(Boolean);
  }, [savedWeek, blockDefs, todayDayOfWeek]);

  // Timed (non-all-day) events also belong in Routine, since they occupy
  // a real slot in the day — all-day events (like birthdays) stay
  // Events-only, since they don't have a specific time to schedule around.
  const todaysTimedEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expandEventsInRange(events, today, today)
      .filter((occ) => !occ.allDay && occ.startTime)
      .map((occ) => {
        const matchedCategory = categories.find((c) => c.id === occ.categoryId);
        const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
        return {
          source: "event",
          id: occ.id,
          name: occ.title,
          colorInfo: color,
          startTime: occ.startTime,
          endTime: occ.endTime,
        };
      });
  }, [events, categories]);

  // Merge routine blocks and timed events into one chronological list.
  const merged = useMemo(() => {
    const sorted = [...todaysRoutineBlocks, ...todaysTimedEvents].sort((a, b) =>
      (a.startTime || "").localeCompare(b.startTime || "")
    );

    // Collapse back-to-back routine blocks that share the same name into
    // a single entry spanning from the first one's start to the last
    // one's end — e.g. two separate "Work on Goals" placements in a row
    // shouldn't show up as two duplicate-looking list rows.
    const collapsed = [];
    for (const item of sorted) {
      const prev = collapsed[collapsed.length - 1];
      const sameRoutineBlock =
        prev &&
        prev.source === "routine" &&
        item.source === "routine" &&
        prev.name === item.name &&
        prev.endTime === item.startTime;

      if (sameRoutineBlock) {
        prev.endTime = item.endTime;
      } else {
        collapsed.push({ ...item });
      }
    }
    return collapsed;
  }, [todaysRoutineBlocks, todaysTimedEvents]);

  if (merged.length === 0) {
    return <EmptyState text="No routine set for today yet." />;
  }

  return (
    <ul className="mb-6 space-y-1.5">
      {merged.map((item, i) => {
        const colorInfo =
          item.source === "event"
            ? item.colorInfo
            : getCategoryColor(item.color, true, item.customColor);
        const content = (
          <>
            {colorInfo.isCustom ? (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={colorInfo.dotStyle} />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colorInfo.dot}`} />
            )}
            <span className="flex-1 truncate">{item.name}</span>
            <span className="text-brand-400 dark:text-brand-400 text-xs flex-shrink-0">
              {item.endTime
                ? `${formatTimeShort(item.startTime)} – ${formatTimeShort(item.endTime)}`
                : formatTimeShort(item.startTime)}
            </span>
          </>
        );

        if (item.source === "event") {
          return (
            <li key={`event-${item.id}-${i}`}>
              <Link
                to={`/calendar?date=${todayStr}&event=${item.id}`}
                className="flex items-center gap-2 pl-6 py-0.5 font-bold text-brand-800 dark:text-brand-100 hover:text-brand-600 dark:hover:text-brand-300"
              >
                {content}
              </Link>
            </li>
          );
        }

        return (
          <li key={`routine-${i}`} className="flex items-center gap-2 pl-6 py-0.5 text-brand-700 dark:text-brand-200">
            {content}
          </li>
        );
      })}
    </ul>
  );
}

// ── Projects todos quick view ─────────────────────────────────────────

function ProjectsTodosSection() {
  const uid = auth.currentUser?.uid;
  const [projects, setProjects] = useState([]);
  const [allTodos, setAllTodos] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToProjects(uid, setProjects);
    const u2 = listenToAllProjectTodos(uid, setAllTodos);
    return () => { u1(); u2(); };
  }, [uid]);

  // Group todos by project, sorted by priority, max 3 each
  const todosByProject = useMemo(() => {
    const map = {};
    allTodos.filter(t => !t.done).forEach(t => {
      if (!map[t.projectId]) map[t.projectId] = [];
      map[t.projectId].push(t);
    });
    // Sort each group by priority
    Object.keys(map).forEach(pid => { map[pid] = sortTodos(map[pid]).slice(0, 3); });
    return map;
  }, [allTodos]);

  const activeProjects = projects.filter(p => todosByProject[p.id]?.length > 0);

  if (activeProjects.length === 0) {
    return <EmptyState text="No upcoming tasks." />;
  }

  const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-brand-400" };

  return (
    <div className="space-y-3">
      {activeProjects.map(project => (
        <div key={project.id}>
          <p className="text-[10px] font-pixel mb-1 pl-4 text-brand-400 dark:text-brand-500 flex items-center gap-1">
            <span className="leading-none">{project.emoji}</span>
            <span>{project.name.toUpperCase()}</span>
          </p>
          <ul className="space-y-0.5">
            {todosByProject[project.id].map(todo => (
              <li key={todo.id} className="flex items-start gap-2.5 pl-4 py-0.5">
                <button
                  onClick={() => {
                    const uid = auth.currentUser?.uid;
                    updateProjectTodo(todo.id, { done: true });
                    if (uid) awardXp(uid, "project-todo", xpId.projectTodo(todo.id), XP.PROJECT_TODO);
                  }}
                  className="flex-shrink-0 mt-[3px] w-3.5 h-3.5 rounded border-2 border-brand-300 dark:border-brand-600 hover:border-brand-500 transition"
                />
                {todo.priority && (
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[6px] ${PRIORITY_DOT[todo.priority]}`} />
                )}
                <span className="text-sm text-brand-700 dark:text-brand-200 leading-snug">{todo.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Common emojis for player icon picker
const PLAYER_ICONS = [
  // Warriors & Magic
  "🧙","⚔️","🏹","🛡️","🗡️","🪄","🔮","🧝","🧛","🧟","🧞","🧜","🧚","🦸","🦹",
  // Animals
  "🦊","🐺","🐉","🦁","🐯","🐻","🦝","🦅","🦉","🦂","🐊","🦖","🐙","🦈","🐬",
  // Nature & Elements
  "🌙","⚡","🔥","❄️","🌊","🌿","☀️","🌪️","🌋","💫","✨","🌸","🍄","🌑","⭐",
  // Gems & Objects
  "💎","💠","🔱","⚜️","🏆","👑","🎭","🎯","🎲","🗝️","📿","🪬","🧿","🪩","🎪",
  // Space & Mystic
  "🚀","🛸","🌌","🪐","☄️","🌠","🔭","🧬","⚗️","🧪","🪤","🎱","🧲","💡","🔬",
  // Cute & Fun
  "🐸","🦄","🐼","🐨","🦘","🦡","🦦","🐧","🦜","🦩","🦚","🦋","🐝","🐛","🦎",
];


// ── Player Card ────────────────────────────────────────────────────────

function PlayerCard() {
  const { playerName, playerIcon, setPlayerIcon, playerLevel, playerXp, xpToNext, totalXp } = useAppSettings();
  const [showIconPicker, setShowIconPicker] = useState(false);
  const btnRef = useRef(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

  const xpPercent = Math.min(100, Math.round((playerXp / xpToNext) * 100));
  const rank = getRank(playerLevel);
  const levelInTier = ((playerLevel - rank.minLevel) % 5) + 1;
  const tierStars = Array.from({ length: 5 }, (_, i) => i < levelInTier);

  const openPicker = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPickerPos({ top: rect.bottom + 8, left: rect.left });
    }
    setShowIconPicker(s => !s);
  };

  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 dark:from-brand-600 dark:to-brand-800 text-white p-4 shadow-md border-2 border-brand-300 dark:border-accent-400 overflow-hidden">
      <PixelPips color="bg-white/30" />

      <div className="flex items-center gap-3 mb-3">
        {/* Player icon — tap to change */}
        <div>
          <button ref={btnRef} onClick={openPicker}
            className="w-12 h-12 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-2xl hover:bg-white/30 transition flex-shrink-0">
            {playerIcon}
          </button>
          {showIconPicker && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setShowIconPicker(false)} />
              <div
                className="fixed z-[61] bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 rounded-2xl shadow-xl p-2 flex flex-wrap gap-1 w-64 max-h-56 overflow-y-auto"
                style={{ top: pickerPos.top, left: pickerPos.left }}
              >
                {PLAYER_ICONS.map((icon, i) => (
                  <button key={`${icon}-${i}`} onClick={() => { setPlayerIcon(icon); setShowIconPicker(false); }}
                    className="w-9 h-9 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-700 flex items-center justify-center text-xl transition">
                    {icon}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-xs font-pixel leading-none truncate">{playerName}</p>
            <span className="text-[9px] font-pixel bg-white/20 px-2 py-1 rounded-full border border-white/30 flex-shrink-0">
              LV {playerLevel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] text-white/70 font-pixel">{rank.name}</p>
            <div className="flex gap-0.5">
              {tierStars.map((filled, i) => (
                <span key={i} className={`text-[8px] ${filled ? "text-yellow-300" : "text-white/30"}`}>★</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden border border-white/20">
        <div className="h-full bg-accent-300 rounded-full transition-all" style={{ width: `${xpPercent}%` }} />
      </div>
      <div className="text-[9px] font-pixel mt-1 text-white/70 flex justify-between">
        <span>
          {totalXp < 0
            ? <span className="text-red-300">{totalXp} XP (debt)</span>
            : <span>{playerXp} / {xpToNext} XP</span>
          }
        </span>
        <span>{xpToNext - playerXp} XP to next level</span>
      </div>
    </div>
  );
}

// ── Home ───────────────────────────────────────────────────────────────

function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-brand-950 transition-colors flex flex-col">
      <PixelCloud className="absolute top-4 right-4 w-16 h-10 text-brand-200 dark:text-brand-800 pointer-events-none opacity-60" />
      <PixelCloud className="absolute top-72 right-3 w-9 h-6 text-brand-200 dark:text-brand-800 pointer-events-none opacity-40" />

      {/* ── Standard page header (same as PageLayout) ── */}
      <header className="sticky-header flex-shrink-0 bg-brand-600 dark:bg-brand-700 text-white px-4 pb-3 flex items-center gap-3 shadow-md transition-colors relative overflow-hidden">
        <PixelPips color="bg-white/40" />
        <button onClick={() => setMenuOpen(true)}
          className="p-1 -ml-1 rounded hover:bg-brand-500 dark:hover:bg-brand-600 relative z-10"
          aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-pixel tracking-wide leading-none">TODAY</h1>
          <p className="text-[10px] text-white/70 font-sans mt-0.5 leading-none">{dateLabel}</p>
        </div>
      </header>

      {/* Side menu — identical style to PageLayout */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative w-64 max-w-[75%] bg-white dark:bg-brand-800 h-full shadow-xl overflow-y-auto transition-colors"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))", paddingLeft: "1rem", paddingRight: "1rem", paddingBottom: "1rem" }}>
            <PixelPips />
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-pixel text-brand-700 dark:text-brand-100">CHAOS MANAGER</span>
              <button onClick={() => setMenuOpen(false)}
                className="text-brand-400 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none"
                aria-label="Close menu">&times;</button>
            </div>
            <nav className="flex flex-col gap-1 mt-2">
              {[
                { name: "Today",          path: "/" },
                { name: "Binging",        path: "/hobbies" },
                { name: "Brain Dump",     path: "/brain-dump" },
                { name: "Calendar",       path: "/calendar" },
                { name: "Chores",         path: "/chores" },
                { name: "Clock",          path: "/timer" },
                { name: "Daily Log",      path: "/daily-log" },
                { name: "Finances",       path: "/finances" },
                { name: "Fitness",        path: "/fitness" },
                { name: "Mini Game",      path: "/mini-game" },
                { name: "Projects",       path: "/goals" },
                { name: "Reminders",      path: "/reminders" },
                { name: "Shopping Lists", path: "/shopping-lists" },
                { name: "Tracker",        path: "/habits" },
                { name: "Others",         path: "/others" },
                { name: "Settings",       path: "/settings" },
              ].map(page => {
                const active = page.path === "/" ? pathname === "/" : pathname.startsWith(page.path);
                return (
                  <Link key={page.path} to={page.path} onClick={() => setMenuOpen(false)}
                    className={`px-3 py-2.5 rounded-lg leading-relaxed font-pixel transition ${
                      active
                        ? "text-[11px] text-accent-600 dark:text-accent-300 bg-accent-50 dark:bg-accent-900/30"
                        : "text-[10px] text-brand-500 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-700 hover:text-brand-700 dark:hover:text-brand-100"
                    }`}>
                    {page.name.toUpperCase()}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ── Main content — single column ── */}
      <div className="flex-1 relative overflow-hidden">
        <PixelCloud className="absolute top-4 right-4 w-16 h-10 text-brand-200 dark:text-brand-800 pointer-events-none opacity-60" />
        <PixelCloud className="absolute top-72 right-3 w-9 h-6 text-brand-200 dark:text-brand-800 pointer-events-none opacity-40" />
      <div className="max-w-md mx-auto px-4 pt-5 pb-10 space-y-4">

        {/* Player card */}
        <PlayerCard />

        {/* Write today's log button */}
        <TodayLogButton />

        {/* Today's quick view panel */}
        <div className="relative rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-300 dark:border-brand-600 shadow-md p-4 overflow-hidden">
          <PixelPips color="bg-brand-400 dark:bg-brand-500" />

          <SectionHeader to="/calendar">ROUTINE</SectionHeader>
          <TodayRoutine />

          <SectionHeader to="/calendar">UPCOMING EVENTS</SectionHeader>
          <UpcomingEvents />

          <SectionHeader to="/reminders">REMINDERS</SectionHeader>
          <RemindersSection />

          <SectionHeader to="/chores">CHORES</SectionHeader>
          <ChoresSection />

          <SectionHeader to="/goals">PROJECTS</SectionHeader>
          <ProjectsTodosSection />
        </div>
      </div>
      </div>
    </div>
  );
}


function ChoresSection() {
  const uid = auth.currentUser?.uid;
  const [chores, setChores] = useState([]);

  useEffect(() => {
    if (!uid) return;
    return listenToChores(uid, setChores);
  }, [uid]);

  const weekChores = useMemo(() => getChoresForWeek(chores), [chores]);

  if (weekChores.length === 0) {
    return <EmptyState text="No chores due this week." />;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const todayDateStr = localDateStr(today);

  // Group by date — overdue first, then by day
  const grouped = {};
  for (const { chore, dueDate } of weekChores) {
    const key = localDateStr(dueDate);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(chore);
  }

  const sortedKeys = Object.keys(grouped).sort();

  return (
    <div className="mb-6 space-y-3">
      {sortedKeys.map(dateKey => {
        const d = new Date(dateKey + "T00:00:00");
        const isOverdue = d < today;
        const isToday = dateKey === todayDateStr;
        const label = isOverdue ? "Overdue"
          : isToday ? "Today"
          : d.toLocaleDateString(undefined, { weekday: "long" });

        return (
          <div key={dateKey}>
            <p className={`text-[10px] font-pixel mb-1 pl-4 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-brand-400 dark:text-brand-500"}`}>
              {label.toUpperCase()}
            </p>
            <ul className="space-y-0.5">
              {grouped[dateKey].map(chore => {
                const completedToday = chore.completedAt === todayDateStr;
                return (
                  <li key={chore.id} className="flex items-center gap-2.5 pl-4 py-0.5">
                    <button
                      onClick={() => {
                        const uid = auth.currentUser?.uid;
                        const wasCompleted = !!chore.completedAt;
                        toggleChoreComplete(chore);
                        if (uid) {
                          const sid = xpId.chore(chore.id, todayDateStr);
                          if (wasCompleted) revokeXp(uid, sid);
                          else awardXp(uid, "chore", sid, XP.CHORE_DONE);
                        }
                      }}
                      className={`flex-shrink-0 mt-[5px] w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition ${
                        completedToday
                          ? "bg-brand-400 border-brand-400"
                          : "border-brand-300 dark:border-brand-600 hover:border-brand-500"
                      }`}
                    >
                      {completedToday && (
                        <svg viewBox="0 0 12 12" className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <span className={`text-sm ${completedToday ? "line-through text-brand-400" : isOverdue ? "text-red-600 dark:text-red-400" : "text-brand-700 dark:text-brand-200"}`}>
                      {chore.name}
                    </span>
                    {chore.completedAt && chore.completedAt !== todayDateStr && (
                      <span className="text-[10px] text-brand-400 dark:text-brand-500 flex-shrink-0">
                        last: {chore.completedAt}
                      </span>
                    )}
                  </li>
                );
      })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TodayLogButton() {
  const uid = auth.currentUser?.uid;
  const [open, setOpen] = useState(false);
  const [hasLog, setHasLog] = useState(false);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  useEffect(() => {
    if (!uid) return;
    return listenToDayLog(uid, todayStr, (log) => {
      // Consider logged if mood or energy or any text field is set
      setHasLog(!!(log && (log.mood || log.energy || log.highlight || log.freeText || log.remember || log.dislike)));
    });
  }, [uid, todayStr]);

  return (
    <>
      {open && <DayEntry uid={uid} date={todayStr} onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen(true)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border-2 shadow-sm transition font-pixel ${
          hasLog
            ? "bg-emerald-500 dark:bg-emerald-700 border-emerald-400 dark:border-emerald-600 text-white"
            : "bg-brand-700 dark:bg-brand-800 border-accent-400 dark:border-accent-500 text-white hover:bg-brand-600 dark:hover:bg-brand-700"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{hasLog ? "✓" : "📓"}</span>
          <div className="text-left">
            <p className="text-[11px] font-pixel tracking-wide">
              {hasLog ? "DAY LOGGED!" : "WRITE TODAY'S LOG"}
            </p>
            <p className="text-[9px] opacity-70 font-pixel mt-0.5">
              {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <span className="text-lg opacity-60">{hasLog ? "✎" : "›"}</span>
      </button>
    </>
  );
}

function RemindersSection() {
  const uid = auth.currentUser?.uid;
  const [reminders, setReminders] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const unsubReminders = listenToReminders(uid, setReminders);
    const unsubCategories = listenToCategories(uid, setCategories);
    return () => { unsubReminders(); unsubCategories(); };
  }, [uid]);

  const visible = useMemo(() => {
    const todays = getTodaysReminders(reminders);
    return sortReminders(todays);
  }, [reminders]);

  if (visible.length === 0) {
    return <EmptyState text="Nothing on your list yet." />;
  }

  return (
    <ul className="mb-6 space-y-1">
      {visible.map((r) => {
        const matchedCategory = categories.find((c) => c.id === r.categoryId);
        const color = matchedCategory
          ? getCategoryColor(matchedCategory.color, true, matchedCategory.customColor)
          : null;
        const priorityDot = { 1: "bg-red-500", 2: "bg-amber-400", 3: "bg-brand-300 dark:bg-brand-600" };
        return (
          <li key={r.id} className="flex items-start gap-2.5 pl-4 py-0.5">
            {/* Checkbox — mt centers it on the first text line (text-sm = 24px line-height, checkbox = 14px) */}
            <button
              onClick={() => {
                const uid = auth.currentUser?.uid;
                const nowDone = !r.completed;
                updateReminder(r.id, { completed: nowDone });
                if (uid) {
                  const sid = xpId.reminder(r.id);
                  if (nowDone) awardXp(uid, "reminder", sid, XP.REMINDER_DONE);
                  else revokeXp(uid, sid);
                }
              }}
              className={`flex-shrink-0 mt-[5px] w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition ${
                r.completed
                  ? "bg-brand-400 border-brand-400"
                  : "border-brand-300 dark:border-brand-600 hover:border-brand-500"
              }`}
            >
              {r.completed && (
                <svg viewBox="0 0 12 12" className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>
            {/* Priority dot — mt centers it on the first text line (dot = 6px) */}
            <span className={`flex-shrink-0 mt-[9px] w-1.5 h-1.5 rounded-full ${priorityDot[r.priority]}`} />
            {/* Text + meta */}
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${r.completed ? "line-through text-brand-400" : "text-brand-700 dark:text-brand-200"}`}>
                {r.text}
              </span>
              {(r.dueDate || color) && (
                <span className="flex items-center gap-1.5 mt-0.5">
                  {r.dueDate && (
                    <span className="text-[10px] text-brand-400 dark:text-brand-500">
                      {new Date(r.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {color && (
                    color.isCustom
                      ? <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={color.dotStyle} />
                      : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color.dot}`} />
                  )}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default Home;
