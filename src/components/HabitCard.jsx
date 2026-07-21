import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { getCategoryColor } from "../lib/categoryColors";
import {
  setHabitEntryStatus, clearHabitEntry,
  listenToTimedSessions, startTimedSession, endTimedSession,
  logManualSession, startBackdatedSession,
} from "../lib/habits";
import { toDateStr, isDueOnDay, getLast7Days, calculateStreak } from "../lib/habitStats";
import { auth } from "../firebase";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function formatElapsed(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatRemaining(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatTarget(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || `${seconds}s`;
}

// ── Monthly tracker grid ───────────────────────────────────────────────
function MonthlyTracker({ habit, entries, uid }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();
  const todayStr = toDateStr(now);
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const color = getCategoryColor(habit.color, true, habit.customColor);

  const doneThisMonth = entries.filter(e =>
    e.date.startsWith(monthStr) && (e.status || "done") === "done"
  ).length;
  const timesPerMonth = habit.timesPerMonth || 1;
  const pct = Math.round((doneThisMonth / timesPerMonth) * 100);

  // Warning: last 4 days and still not done enough
  const isLastFourDays = todayDate >= daysInMonth - 3;
  const showWarning = isLastFourDays && doneThisMonth < timesPerMonth;

  const handleToggle = async (dateStr) => {
    if (dateStr > todayStr) return;
    const uid = auth.currentUser?.uid;
    const entry = entries.find(e => e.date === dateStr);
    const status = entry ? (entry.status || "done") : null;
    if (!entry) {
      await setHabitEntryStatus(uid, habit.id, dateStr, "done");
      if (uid) awardXp(uid, "habit", xpId.habitDone(habit.id, dateStr), XP.HABIT_DONE);
    } else if (status === "done") {
      await clearHabitEntry(entry.id);
      if (uid) revokeXp(uid, xpId.habitDone(habit.id, dateStr));
    }
  };

  // Build array of days with padding for Mon-start alignment
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
  const days = [];
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(year, month, i + 1);
    days.push({
      date: i + 1,
      dayLetter: ["S","M","T","W","T","F","S"][d.getDay()],
      dateStr: `${year}-${String(month+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`,
      isFuture: i + 1 > todayDate,
    });
  }

  return (
    <div className="space-y-2">
      {/* Progress row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-brand-100 dark:bg-brand-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-400" : color.isCustom ? "" : color.dot.replace("bg-","bg-")}`}
            style={{
              width: `${Math.min(pct, 100)}%`,
              ...(color.isCustom ? { backgroundColor: color.hex } : {}),
            }}
          />
        </div>
        <span className="text-[10px] text-brand-500 dark:text-brand-400 flex-shrink-0">
          {doneThisMonth}/{timesPerMonth} {showWarning && <span className="text-amber-500">⚠️</span>}
        </span>
      </div>

      {/* Day grid */}
      <div className="flex flex-wrap gap-1">
        {days.map(({ date, dayLetter, dateStr, isFuture }) => {
          const entry = entries.find(e => e.date === dateStr);
          const done = entry && (entry.status || "done") === "done";
          const isToday = dateStr === todayStr;

          const baseStyle = done
            ? color.isCustom
              ? { backgroundColor: color.hex }
              : undefined
            : undefined;

          return (
            <button
              key={dateStr}
              onClick={() => handleToggle(dateStr)}
              disabled={isFuture}
              title={`${dayLetter} ${date}`}
              className={`
                flex flex-col items-center justify-center rounded-md transition
                w-7 h-7
                ${isFuture ? "opacity-30 cursor-default" : "cursor-pointer hover:opacity-80"}
                ${isToday ? "ring-2 ring-accent-400 dark:ring-accent-300" : ""}
                ${done
                  ? color.isCustom ? "" : color.dot
                  : "bg-brand-100 dark:bg-brand-700"
                }
              `}
              style={baseStyle}
            >
              <span className={`text-[8px] font-medium leading-none ${done ? "text-white" : "text-brand-500 dark:text-brand-400"}`}>
                {date}
              </span>
              <span className={`text-[6px] leading-none ${done ? "text-white/70" : "text-brand-400 dark:text-brand-600"}`}>
                {dayLetter}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline manual entry form ───────────────────────────────────────────
function InlineManualForm({ habit, entries, uid, mode, onDone, onCancel }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [startDate, setStartDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState(todayStr);
  const [endTime, setEndTime] = useState(nowTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fieldClass = "rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 w-full";

  const handleSave = async () => {
    const startMs = new Date(`${startDate}T${startTime}:00`).getTime();
    if (mode === "continue") {
      if (isNaN(startMs) || startMs > Date.now()) { setError("Start must be in the past."); return; }
      setSaving(true);
      try {
        await startBackdatedSession(uid, habit.id, habit.targetSeconds, startMs);
        onDone();
      } catch { setError("Couldn't start — try again."); }
      finally { setSaving(false); }
    } else {
      const endMs = new Date(`${endDate}T${endTime}:00`).getTime();
      if (isNaN(startMs) || isNaN(endMs)) { setError("Invalid date/time."); return; }
      if (endMs <= startMs) { setError("End must be after start."); return; }
      setSaving(true);
      try {
        const { succeeded, assignedDate } = await logManualSession(uid, habit.id, habit.targetSeconds, startMs, endMs);
        const existing = entries.find(e => e.date === assignedDate);
        if (existing) await clearHabitEntry(existing.id);
        await setHabitEntryStatus(uid, habit.id, assignedDate, succeeded ? "done" : "failed");
        // XP for timed session
        revokeXp(uid, xpId.habitDone(habit.id, assignedDate));
        revokeXp(uid, xpId.habitFailed(habit.id, assignedDate));
        if (succeeded) awardXp(uid, "habit", xpId.habitDone(habit.id, assignedDate), XP.HABIT_DONE);
        else awardXp(uid, "habit-failed", xpId.habitFailed(habit.id, assignedDate), XP.HABIT_FAILED);
        onDone();
      } catch { setError("Couldn't save — try again."); }
      finally { setSaving(false); }
    }
  };

  return (
    <div className="rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 p-3 space-y-2">
      <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">
        {mode === "continue" ? "CONTINUE FROM" : "LOG PAST SESSION"}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <p className="text-[9px] text-brand-400 dark:text-brand-500 mb-0.5">Start date</p>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <p className="text-[9px] text-brand-400 dark:text-brand-500 mb-0.5">Start time</p>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={fieldClass} />
        </div>
        {mode === "log" && <>
          <div>
            <p className="text-[9px] text-brand-400 dark:text-brand-500 mb-0.5">End date</p>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <p className="text-[9px] text-brand-400 dark:text-brand-500 mb-0.5">End time</p>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={fieldClass} />
          </div>
        </>}
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="px-2.5 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "…" : mode === "continue" ? "Continue" : "Save"}
        </button>
        <button onClick={onCancel} className="px-2.5 py-1 text-xs text-brand-400 dark:text-brand-500">Cancel</button>
      </div>
    </div>
  );
}

// ── Inline timed tracker ───────────────────────────────────────────────
function InlineTimedTracker({ habit, entries, uid }) {
  const [sessions, setSessions] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [starting, setSt] = useState(false);
  const [stopping, setSp] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const tickRef = useRef(null);

  useEffect(() => {
    return listenToTimedSessions(uid, habit.id, (s) => {
      s.sort((a, b) => b.startedAt - a.startedAt);
      setSessions(s);
    });
  }, [uid, habit.id]);

  const active = sessions.find(s => s.endedAt === null);
  const target = habit.targetSeconds || 0;

  useEffect(() => {
    clearInterval(tickRef.current);
    if (active) {
      const tick = () => setElapsed(Math.floor((Date.now() - active.startedAt) / 1000));
      tick();
      tickRef.current = setInterval(tick, 1000);
    }
    return () => clearInterval(tickRef.current);
  }, [active?.id, active?.startedAt]);

  const progress = active ? Math.min(elapsed / target, 1) : 0;
  const remaining = Math.max(target - elapsed, 0);
  const exceeded = active && elapsed >= target;

  const handleStart = async () => {
    setSt(true);
    try { await startTimedSession(uid, habit.id, target); }
    finally { setSt(false); }
  };

  const handleStop = async () => {
    if (!active) return;
    if (!confirm("Stop timer? If under the target, today counts as a failure.")) return;
    setSp(true);
    try {
      const { succeeded } = await endTimedSession(active.id, active);
      const existing = entries.find(e => e.date === active.assignedDate);
      if (existing) await clearHabitEntry(existing.id);
      await setHabitEntryStatus(uid, habit.id, active.assignedDate, succeeded ? "done" : "failed");
      revokeXp(uid, xpId.habitDone(habit.id, active.assignedDate));
      revokeXp(uid, xpId.habitFailed(habit.id, active.assignedDate));
      if (succeeded) awardXp(uid, "habit", xpId.habitDone(habit.id, active.assignedDate), XP.HABIT_DONE);
      else awardXp(uid, "habit-failed", xpId.habitFailed(habit.id, active.assignedDate), XP.HABIT_FAILED);
    } finally { setSp(false); }
  };

  const lastDone = sessions.find(s => s.endedAt !== null);

  return (
    <div className="space-y-2">
      <div className="w-full h-2 bg-brand-100 dark:bg-brand-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${
          active ? exceeded ? "bg-emerald-400" : "bg-accent-400 dark:bg-accent-300" : "bg-brand-200 dark:bg-brand-600"
        }`} style={{ width: active ? `${progress * 100}%` : "0%" }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {active ? (
            <div>
              <span className="text-sm font-semibold text-brand-700 dark:text-brand-200 tabular-nums">
                {exceeded ? formatRemaining(elapsed - target) : formatRemaining(remaining)}
              </span>
              <span className="text-[10px] text-brand-400 dark:text-brand-500 ml-1.5">
                {exceeded ? "✓ over target" : "remaining"}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-brand-400 dark:text-brand-500">
              Target: {formatTarget(target)}
              {lastDone && (
                <span className={`ml-2 font-medium ${lastDone.succeeded ? "text-emerald-500" : "text-red-400"}`}>
                  · Last: {formatElapsed(lastDone.durationSeconds || 0)} {lastDone.succeeded ? "✓" : "✕"}
                </span>
              )}
            </span>
          )}
        </div>
        {active ? (
          <button onClick={handleStop} disabled={stopping}
            className="flex-shrink-0 px-3 py-1 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-50">
            {stopping ? "…" : "Stop"}
          </button>
        ) : (
          <button onClick={handleStart} disabled={starting}
            className="flex-shrink-0 px-3 py-1 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition disabled:opacity-50">
            {starting ? "…" : "Start"}
          </button>
        )}
      </div>
      {!active && !formMode && (
        <div className="flex gap-1.5">
          <button onClick={() => setFormMode("continue")}
            className="flex-1 py-1 text-[10px] text-brand-500 dark:text-brand-400 border border-brand-200 dark:border-brand-600 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-700 transition">
            Continue from…
          </button>
          <button onClick={() => setFormMode("log")}
            className="flex-1 py-1 text-[10px] text-brand-500 dark:text-brand-400 border border-brand-200 dark:border-brand-600 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-700 transition">
            Log past
          </button>
        </div>
      )}
      {formMode && (
        <InlineManualForm habit={habit} entries={entries} uid={uid}
          mode={formMode} onDone={() => setFormMode(null)} onCancel={() => setFormMode(null)} />
      )}
    </div>
  );
}

// ── Main HabitCard ─────────────────────────────────────────────────────
function HabitCard({ habit, entries, uid, onEdit, onDelete, dragIndex, isDragOver, onDragStart, onDragOver, onDragEnd }) {
  const color = getCategoryColor(habit.color, true, habit.customColor);
  const isTimed = habit.trackType === "timed";
  const isMonthly = habit.trackType === "monthly";

  // Warning for monthly: last 4 days and not enough done
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const doneThisMonth = entries.filter(e =>
    e.date.startsWith(monthStr) && (e.status || "done") === "done"
  ).length;
  const showWarning = isMonthly && dayOfMonth >= daysInMonth - 3 && doneThisMonth < (habit.timesPerMonth || 1);

  const getStatus = (dateStr) => {
    const entry = entries.find((e) => e.date === dateStr);
    if (!entry) return null;
    return entry.status || "done";
  };

  const doneDateSet = new Set(entries.filter((e) => (e.status || "done") === "done").map((e) => e.date));
  const streak = calculateStreak(habit, doneDateSet);
  const last7Days = getLast7Days();
  const todayStr = toDateStr(new Date());

  const handleCycleDay = async (dateStr) => {
    const uid = auth.currentUser?.uid;
    const entry = entries.find((e) => e.date === dateStr);
    const currentStatus = entry ? entry.status || "done" : null;
    if (!entry) {
      // none → done
      await setHabitEntryStatus(uid, habit.id, dateStr, "done");
      if (uid) {
        revokeXp(uid, xpId.habitFailed(habit.id, dateStr));
        awardXp(uid, "habit", xpId.habitDone(habit.id, dateStr), XP.HABIT_DONE);
      }
    } else if (currentStatus === "done") {
      // done → failed
      await clearHabitEntry(entry.id);
      await setHabitEntryStatus(uid, habit.id, dateStr, "failed");
      if (uid) {
        revokeXp(uid, xpId.habitDone(habit.id, dateStr));
        awardXp(uid, "habit-failed", xpId.habitFailed(habit.id, dateStr), XP.HABIT_FAILED);
      }
    } else {
      // failed → none
      await clearHabitEntry(entry.id);
      if (uid) revokeXp(uid, xpId.habitFailed(habit.id, dateStr));
    }
  };

  return (
    <div
      data-drag-index={dragIndex}
      className={`rounded-2xl bg-white dark:bg-brand-800 border-2 transition ${
        isDragOver
          ? "border-accent-400 dark:border-accent-300 shadow-lg scale-[1.01]"
          : "border-brand-200 dark:border-brand-600"
      } p-3`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <Link to={`/habits/${habit.id}`}
          className="flex items-center gap-2 min-w-0 hover:text-brand-600 dark:hover:text-brand-300">
          {color.isCustom
            ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={color.dotStyle} />
            : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />
          }
          <span className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">
            {habit.name}
          </span>
          {showWarning && <span className="flex-shrink-0 text-amber-500 text-sm" title="At risk of missing monthly goal">⚠️</span>}
        </Link>
        {streak > 0 && !isMonthly && (
          <span className="text-[10px] flex-shrink-0 bg-brand-50 dark:bg-brand-900 text-brand-500 dark:text-brand-300 px-2 py-0.5 rounded-full whitespace-nowrap">
            {streak} day{streak !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Body */}
      {isTimed ? (
        <InlineTimedTracker habit={habit} entries={entries} uid={uid} />
      ) : isMonthly ? (
        <MonthlyTracker habit={habit} entries={entries} uid={uid} />
      ) : (
        <div className="flex gap-1">
          {last7Days.map((day) => {
            const dateStr = toDateStr(day);
            const dayOfWeek = day.getDay();
            const due = isDueOnDay(habit, dayOfWeek);
            const status = getStatus(dateStr);
            const isToday = dateStr === todayStr;
            const isFuture = day > new Date();

            if (!due) return (
              <div key={dateStr} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full h-6 rounded-md bg-brand-50 dark:bg-brand-900" />
                <span className="text-[8px] text-brand-200 dark:text-brand-700">{DAY_LETTERS[dayOfWeek]}</span>
              </div>
            );

            const baseClasses = `relative w-full h-6 rounded-md transition flex items-center justify-center ${
              status === "failed" ? "bg-red-100 dark:bg-red-950" : ""
            } ${isToday ? "ring-2 ring-accent-500 dark:ring-accent-300" : ""} ${
              isFuture ? "cursor-default" : "cursor-pointer hover:opacity-60"
            }`;
            const customStyle = color.isCustom && status !== "failed"
              ? { backgroundColor: color.hex, opacity: status === "done" ? 1 : 0.2 } : undefined;
            const presetClasses = !color.isCustom && status !== "failed"
              ? status === "done" ? `${color.dot} opacity-100` : `${color.dot} opacity-20` : "";

            return (
              <div key={dateStr} className="flex-1 flex flex-col items-center gap-0.5">
                <button onClick={() => !isFuture && handleCycleDay(dateStr)} disabled={isFuture}
                  className={`${baseClasses} ${presetClasses}`} style={customStyle}>
                  {status === "failed" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-red-500 dark:text-red-400">
                      <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
                    </svg>
                  )}
                </button>
                <span className={`text-[8px] ${isToday ? "text-brand-600 dark:text-brand-200 font-medium" : "text-brand-300 dark:text-brand-500"}`}>
                  {DAY_LETTERS[dayOfWeek]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions + drag handle */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-3">
          <button onClick={() => onEdit(habit)} className="text-[10px] text-brand-400 dark:text-brand-500 hover:text-brand-600 dark:hover:text-brand-300">Edit</button>
          <button onClick={() => onDelete(habit)} className="text-[10px] text-red-400 hover:text-red-600 dark:hover:text-red-300">Delete</button>
        </div>
        {/* Drag handle */}
        <DragHandle
          dragIndex={dragIndex}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        />
      </div>
    </div>
  );
}

function DragHandle({ dragIndex, onDragStart, onDragOver, onDragEnd }) {
  const handleRef = useRef(null);

  const handlePointerDown = (e) => {
    e.preventDefault();
    const el = handleRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    onDragStart?.(dragIndex);

    const onMove = (mv) => {
      // Temporarily hide pointer capture so elementFromPoint works
      el.style.pointerEvents = "none";
      const target = document.elementFromPoint(mv.clientX, mv.clientY);
      el.style.pointerEvents = "";
      if (!target) return;
      const card = target.closest("[data-drag-index]");
      if (card) {
        const overIdx = parseInt(card.getAttribute("data-drag-index"), 10);
        if (!isNaN(overIdx)) onDragOver?.(overIdx);
      }
    };

    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      onDragEnd?.();
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      ref={handleRef}
      className="cursor-grab active:cursor-grabbing p-1.5 -mr-1 touch-none select-none"
      title="Drag to reorder"
      onPointerDown={handlePointerDown}
    >
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="text-brand-300 dark:text-brand-600">
        <line x1="1" y1="2" x2="15" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export default HabitCard;
