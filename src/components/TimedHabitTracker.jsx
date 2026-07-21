import { useState, useEffect, useRef } from "react";
import {
  listenToTimedSessions, startTimedSession, endTimedSession,
  deleteTimedSession, logManualSession,
  setHabitEntryStatus, clearHabitEntry,
} from "../lib/habits";

function formatDuration(seconds) {
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
  const s = seconds % 60;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
}

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

// ── Manual entry form ────────────────────────────────────────────────
function ManualEntryForm({ habit, entries, uid, onDone, onCancel }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [startDate, setStartDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState(defaultDate);
  const [endTime, setEndTime] = useState(defaultTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const startMs = new Date(`${startDate}T${startTime}:00`).getTime();
    const endMs   = new Date(`${endDate}T${endTime}:00`).getTime();
    if (isNaN(startMs) || isNaN(endMs)) { setError("Invalid date/time."); return; }
    if (endMs <= startMs) { setError("End must be after start."); return; }
    setSaving(true);
    try {
      const { succeeded, assignedDate } = await logManualSession(uid, habit.id, habit.targetSeconds, startMs, endMs);
      const existing = entries.find(e => e.date === assignedDate);
      if (existing) await clearHabitEntry(existing.id);
      await setHabitEntryStatus(uid, habit.id, assignedDate, succeeded ? "done" : "failed");
      onDone();
    } catch (e) {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = "rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400";

  return (
    <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4 space-y-3">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">LOG SESSION MANUALLY</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-brand-400 dark:text-brand-500">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`w-full ${field}`} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-brand-400 dark:text-brand-500">Start time</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={`w-full ${field}`} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-brand-400 dark:text-brand-500">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`w-full ${field}`} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-brand-400 dark:text-brand-500">End time</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={`w-full ${field}`} />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save session"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-brand-400 dark:text-brand-500">Cancel</button>
      </div>
    </div>
  );
}

// ── Single session card ──────────────────────────────────────────────
function SessionCard({ session, entries, uid, habit, isActive, onSessionEnded, onDelete }) {
  const [elapsed, setElapsed] = useState(
    isActive ? Math.floor((Date.now() - session.startedAt) / 1000) : (session.durationSeconds || 0)
  );
  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [isActive, session.startedAt]);

  const target = habit.targetSeconds || 0;
  const progress = Math.min(elapsed / target, 1);
  const remaining = Math.max(target - elapsed, 0);
  const exceeded = elapsed > target;

  const startDate = new Date(session.startedAt);
  const startLabel = startDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " " + startDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const handleStop = async () => {
    if (!confirm("Stop this timer? If you haven't reached the target, this will count as a failure for the assigned date.")) return;
    setStopping(true);
    try {
      const { durationSeconds, succeeded } = await endTimedSession(session.id, session);
      const existingEntry = entries.find(e => e.habitId === habit.id && e.date === session.assignedDate);
      if (existingEntry) await clearHabitEntry(existingEntry.id);
      await setHabitEntryStatus(uid, habit.id, session.assignedDate, succeeded ? "done" : "failed");
      onSessionEnded();
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this session? The habit entry for this date will also be removed.")) return;
    setDeleting(true);
    try {
      // Remove the habit entry for the assigned date
      const existingEntry = entries.find(e => e.habitId === habit.id && e.date === session.assignedDate);
      if (existingEntry) await clearHabitEntry(existingEntry.id);
      await deleteTimedSession(session.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 p-4 ${
      isActive
        ? "border-accent-400 dark:border-accent-300 bg-accent-50 dark:bg-accent-900/20"
        : session.succeeded
        ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20"
        : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className={`text-[10px] font-pixel uppercase tracking-wide ${
            isActive ? "text-accent-600 dark:text-accent-300"
            : session.succeeded ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-500 dark:text-red-400"
          }`}>
            {isActive ? "⏳ In progress" : session.succeeded ? "✓ Success" : "✕ Failed"}
          </span>
          <p className="text-[10px] text-brand-400 dark:text-brand-500 mt-0.5">
            Started {startLabel} · for {session.assignedDate}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isActive && (
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              session.succeeded
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
            }`}>
              {formatDuration(session.durationSeconds || 0)}
            </span>
          )}
          {/* Delete button — shown on completed sessions */}
          {!isActive && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete this session"
              className="text-brand-300 hover:text-red-400 dark:hover:text-red-400 text-lg leading-none disabled:opacity-50"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative w-full h-3 bg-brand-100 dark:bg-brand-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isActive
              ? exceeded ? "bg-emerald-400" : "bg-accent-400 dark:bg-accent-300"
              : session.succeeded ? "bg-emerald-400" : "bg-red-400"
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Time display */}
      {isActive && (
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-pixel text-brand-700 dark:text-brand-200 leading-none">
              {formatDuration(elapsed)}
            </p>
            <p className="text-xs text-brand-400 dark:text-brand-500 mt-1">
              {exceeded
                ? `✓ Target reached! +${formatDuration(elapsed - target)} over`
                : `${formatDuration(remaining)} remaining`}
            </p>
          </div>
          <button
            onClick={handleStop}
            disabled={stopping}
            className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl transition disabled:opacity-50"
          >
            {stopping ? "Stopping…" : "Stop"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main tracker ─────────────────────────────────────────────────────
export default function TimedHabitTracker({ uid, habit, entries }) {
  const [sessions, setSessions] = useState([]);
  const [starting, setStarting] = useState(false);
  const [lastEnded, setLastEnded] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    return listenToTimedSessions(uid, habit.id, (s) => {
      s.sort((a, b) => b.startedAt - a.startedAt);
      setSessions(s);
    });
  }, [uid, habit.id]);

  const activeSession = sessions.find(s => s.endedAt === null);
  const completedSessions = sessions.filter(s => s.endedAt !== null);

  const handleStart = async () => {
    setStarting(true);
    setLastEnded(false);
    try {
      await startTimedSession(uid, habit.id, habit.targetSeconds);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Target info */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-brand-500 dark:text-brand-400">Target:</span>
        <span className="text-xs font-medium text-brand-700 dark:text-brand-200">
          {formatTarget(habit.targetSeconds || 0)}
        </span>
      </div>

      {/* Active session */}
      {activeSession && (
        <SessionCard
          key={activeSession.id}
          session={activeSession}
          entries={entries}
          uid={uid}
          habit={habit}
          isActive
          onSessionEnded={() => setLastEnded(true)}
          onDelete={() => {}}
        />
      )}

      {/* Start / manual buttons */}
      {!activeSession && !showManual && (
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex-1 py-3 rounded-2xl border-2 border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition disabled:opacity-50"
          >
            {starting ? "Starting…" : lastEnded ? "▶ Start next session" : "▶ Start timer"}
          </button>
          <button
            onClick={() => setShowManual(true)}
            className="px-3 py-3 rounded-2xl border-2 border-dashed border-brand-200 dark:border-brand-600 text-brand-400 dark:text-brand-500 text-xs hover:bg-brand-50 dark:hover:bg-brand-800 transition"
            title="Log a past session manually"
          >
            + Log past
          </button>
        </div>
      )}

      {/* Manual entry form */}
      {showManual && (
        <ManualEntryForm
          habit={habit}
          entries={entries}
          uid={uid}
          onDone={() => setShowManual(false)}
          onCancel={() => setShowManual(false)}
        />
      )}

      {/* Completed sessions */}
      {completedSessions.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 px-1">PAST SESSIONS</p>
          {completedSessions.slice(0, 10).map(s => (
            <SessionCard
              key={s.id}
              session={s}
              entries={entries}
              uid={uid}
              habit={habit}
              isActive={false}
              onSessionEnded={() => {}}
              onDelete={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
