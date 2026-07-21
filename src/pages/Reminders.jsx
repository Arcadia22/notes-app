import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";
import { Sparkle } from "../components/Decorations";
import { auth } from "../firebase";
import { listenToCategories } from "../lib/events";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";
import { getCategoryColor } from "../lib/categoryColors";
import {
  listenToReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  sortReminders,
  currentWeekBounds,
} from "../lib/reminders";

const PRIORITY_LABELS = { 1: "High", 2: "Medium", 3: "Low" };
const PRIORITY_COLORS = {
  1: "text-red-500 dark:text-red-400",
  2: "text-amber-500 dark:text-amber-400",
  3: "text-brand-400 dark:text-brand-500",
};
const PRIORITY_DOT = {
  1: "bg-red-500",
  2: "bg-amber-400",
  3: "bg-brand-300 dark:bg-brand-600",
};

// ── Single reminder row ───────────────────────────────────────────────
function ReminderRow({ reminder, categories, onToggle, onDelete, onEdit }) {
  const matchedCategory = categories.find((c) => c.id === reminder.categoryId);
  const color = matchedCategory
    ? getCategoryColor(matchedCategory.color, true, matchedCategory.customColor)
    : null;

  return (
    <li className={`flex items-start gap-3 py-2.5 px-4 rounded-xl transition ${
      reminder.completed ? "opacity-50" : ""
    }`}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(reminder)}
        className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition ${
          reminder.completed
            ? "bg-brand-500 border-brand-500"
            : "border-brand-300 dark:border-brand-600 hover:border-brand-500"
        }`}
        aria-label={reminder.completed ? "Mark incomplete" : "Mark complete"}
      >
        {reminder.completed && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6l3 3 5-5" />
          </svg>
        )}
      </button>

      {/* Priority dot */}
      <span className={`flex-shrink-0 mt-1.5 w-2 h-2 rounded-full ${PRIORITY_DOT[reminder.priority]}`} />

      {/* Text + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm break-words ${reminder.completed ? "line-through text-brand-400" : "text-brand-800 dark:text-brand-100"}`}>
          {reminder.text}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium ${PRIORITY_COLORS[reminder.priority]}`}>
            {PRIORITY_LABELS[reminder.priority]}
          </span>
          {reminder.dueDate && (
            <span className="text-[10px] text-brand-400 dark:text-brand-500">
              {new Date(reminder.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {color && (
            <span className="flex items-center gap-1">
              {color.isCustom
                ? <span className="w-1.5 h-1.5 rounded-full" style={color.dotStyle} />
                : <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />}
              <span className="text-[10px] text-brand-400 dark:text-brand-500">{matchedCategory.name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex gap-1">
        <button onClick={() => onEdit(reminder)} className="text-brand-300 hover:text-brand-500 p-1" title="Edit">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 2.5l2.5 2.5-8 8H3v-2.5l8-8z" />
          </svg>
        </button>
        <button onClick={() => onDelete(reminder.id)} className="text-brand-300 hover:text-red-400 p-1" title="Delete">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5l.5-9" />
          </svg>
        </button>
      </div>
    </li>
  );
}

// ── Add / Edit form ───────────────────────────────────────────────────
function ReminderForm({ uid, categories, initial, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text || "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [priority, setPriority] = useState(initial?.priority ?? 2);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave({
        text: trimmed,
        dueDate: dueDate || null,
        categoryId: dueDate && categoryId ? categoryId : null,
        priority: Number(priority),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-accent-400 dark:border-accent-300 p-4 space-y-3 mb-4">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave(); if (e.key === "Escape") onCancel(); }}
        placeholder="What do you need to remember?"
        rows={2}
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
      />

      {/* Priority */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-brand-500 dark:text-brand-400 flex-shrink-0">Priority:</span>
        <div className="flex gap-1">
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                priority === p
                  ? p === 1 ? "bg-red-500 text-white border-red-500"
                    : p === 2 ? "bg-amber-400 text-white border-amber-400"
                    : "bg-brand-400 text-white border-brand-400"
                  : "border-brand-200 dark:border-brand-600 text-brand-500 dark:text-brand-400"
              }`}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Due date (optional) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-brand-500 dark:text-brand-400 flex-shrink-0">Date:</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="flex-1 text-xs rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-700 dark:text-brand-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
        {dueDate && (
          <button onClick={() => { setDueDate(""); setCategoryId(""); }} className="text-brand-300 hover:text-brand-500 text-sm">✕</button>
        )}
      </div>

      {/* Category — only if a due date is set */}
      {dueDate && categories.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-500 dark:text-brand-400 flex-shrink-0">Category:</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex-1 text-xs rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-700 dark:text-brand-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {initial ? "Save" : "Add reminder"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
function Reminders() {
  const uid = auth.currentUser?.uid;
  const [reminders, setReminders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [showThisWeekCompleted, setShowThisWeekCompleted] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [openMonths, setOpenMonths] = useState({});

  useEffect(() => {
    if (!uid) return;
    const unsubReminders = listenToReminders(uid, setReminders);
    const unsubCategories = listenToCategories(uid, setCategories);
    return () => { unsubReminders(); unsubCategories(); };
  }, [uid]);

  // Week boundaries
  const { mondayStr, sundayStr, todayStr } = useMemo(() => currentWeekBounds(), []);

  // Active: ALL uncompleted reminders regardless of date
  const { undated, dated } = useMemo(() => {
    const active = reminders.filter((r) => !r.completed);
    const sorted = sortReminders(active);
    return {
      undated: sorted.filter((r) => !r.dueDate),
      dated: sorted.filter((r) => r.dueDate),
    };
  }, [reminders]);

  // This week's completed: only use completedAt to determine the week.
  // If completedAt is missing (pre-feature reminders), default to this week.
  const thisWeekCompleted = useMemo(() => {
    return sortReminders(reminders.filter((r) => {
      if (!r.completed) return false;
      if (!r.completedAt) return true; // no stamp → show here as safe default
      return r.completedAt >= mondayStr && r.completedAt <= sundayStr;
    }));
  }, [reminders, mondayStr, sundayStr]);

  // Memory Lane: completed in a previous week (strictly before this Monday)
  const pastReminders = useMemo(() => {
    return sortReminders(reminders.filter((r) => {
      if (!r.completed) return false;
      if (!r.completedAt) return false;
      return r.completedAt < mondayStr;
    }));
  }, [reminders, mondayStr]);

  // Group past reminders by "YYYY-MM" using completedAt
  const pastByMonth = useMemo(() => {
    const map = {};
    for (const r of pastReminders) {
      const key = r.completedAt.slice(0, 7); // "YYYY-MM"
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    // Sort months newest first
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const [y, m] = key.split("-");
        const label = new Date(Number(y), Number(m) - 1, 1)
          .toLocaleDateString(undefined, { month: "long", year: "numeric" });
        return { key, label, reminders: map[key] };
      });
  }, [pastReminders]);

  // Group dated active reminders by date
  const datedByDate = useMemo(() => {
    const map = {};
    for (const r of dated) {
      if (!map[r.dueDate]) map[r.dueDate] = [];
      map[r.dueDate].push(r);
    }
    return Object.keys(map).sort().map((date) => ({ date, reminders: map[date] }));
  }, [dated]);

  const handleAdd = async (data) => {
    await createReminder(uid, data);
    setAdding(false);
  };

  const handleEdit = async (data) => {
    await updateReminder(editingReminder.id, data);
    setEditingReminder(null);
  };

  const handleToggle = (reminder) => {
    const uid = auth.currentUser?.uid;
    const nowDone = !reminder.completed;
    updateReminder(reminder.id, { completed: nowDone });
    if (uid) {
      const sid = xpId.reminder(reminder.id);
      if (nowDone) awardXp(uid, "reminder", sid, XP.REMINDER_DONE);
      else revokeXp(uid, sid);
    }
  };

  const handleDelete = (id) => {
    if (confirm("Delete this reminder?")) deleteReminder(id);
  };

  const ReminderList = ({ items }) => (
    <div className="rounded-2xl bg-white dark:bg-brand-800 border border-brand-100 dark:border-brand-700 divide-y divide-brand-50 dark:divide-brand-700">
      <ul>
        {items.map((r) => (
          <ReminderRow key={r.id} reminder={r} categories={categories}
            onToggle={handleToggle} onDelete={handleDelete} onEdit={setEditingReminder} />
        ))}
      </ul>
    </div>
  );

  return (
    <PageLayout title="Reminders">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">

        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 flex items-center gap-2">
            <Sparkle className="w-4 h-4" />
            REMINDERS
          </h2>
          {!adding && (
            <button onClick={() => setAdding(true)} className="text-xs text-accent-500 dark:text-accent-300 font-medium">
              + Add reminder
            </button>
          )}
        </div>

        {adding && (
          <ReminderForm uid={uid} categories={categories} onSave={handleAdd} onCancel={() => setAdding(false)} />
        )}
        {editingReminder && (
          <ReminderForm uid={uid} categories={categories} initial={editingReminder} onSave={handleEdit} onCancel={() => setEditingReminder(null)} />
        )}

        {/* Undated / ongoing reminders */}
        {undated.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-2 px-1">ONGOING</p>
            <ReminderList items={undated} />
          </div>
        )}

        {/* Dated reminders grouped by date */}
        {datedByDate.map(({ date, reminders: dayReminders }) => {
          const dateObj = new Date(date + "T00:00:00");
          const isOldYear = dateObj.getFullYear() < new Date().getFullYear();
          const label = dateObj.toLocaleDateString(undefined, {
            weekday: "long", month: "long", day: "numeric",
            ...(isOldYear ? { year: "numeric" } : {}),
          });
          return (
            <div key={date} className="mb-5">
              <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-2 px-1">{label.toUpperCase()}</p>
              <ReminderList items={dayReminders} />
            </div>
          );
        })}

        {/* Empty state */}
        {undated.length === 0 && datedByDate.length === 0 && !adding && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkle className="w-6 h-6 opacity-40" />
            <p className="text-sm text-brand-300 dark:text-brand-500 italic">Nothing to remember right now.</p>
            <button onClick={() => setAdding(true)} className="mt-2 text-xs text-accent-500 dark:text-accent-300 font-medium underline">
              Add your first reminder
            </button>
          </div>
        )}

        {/* This week's completed */}
        {thisWeekCompleted.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowThisWeekCompleted((s) => !s)}
              className="text-xs text-brand-400 dark:text-brand-500 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 mb-2"
            >
              <span>{showThisWeekCompleted ? "▼" : "▶"}</span>
              Completed this week ({thisWeekCompleted.length})
            </button>
            {showThisWeekCompleted && <ReminderList items={thisWeekCompleted} />}
          </div>
        )}

        {/* Past reminders archive — always visible */}
        <div className="mt-4">
          <button
            onClick={() => setShowPast((s) => !s)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-900 border border-brand-100 dark:border-brand-700 text-xs text-brand-500 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800 transition"
          >
            <span className="flex items-center gap-1.5">
              <span>🗂️</span>
              <span className="font-medium">Memory Lane</span>
              <span className="text-brand-300 dark:text-brand-600">
                {pastReminders.length > 0
                  ? `— ${pastReminders.length} past reminder${pastReminders.length !== 1 ? "s" : ""}`
                  : "— completed reminders from past weeks"}
              </span>
            </span>
            <span>{showPast ? "▲" : "▼"}</span>
          </button>

          {showPast && (
            <div className="mt-2 space-y-2">
              {pastByMonth.length === 0 ? (
                <p className="text-xs text-brand-300 dark:text-brand-600 italic text-center py-4">
                  Nothing here yet — completed reminders from previous weeks will appear here.
                </p>
              ) : (
                pastByMonth.map(({ key, label, reminders: monthItems }) => (
                  <div key={key} className="rounded-xl border border-brand-100 dark:border-brand-700 overflow-hidden">
                    {/* Month header */}
                    <button
                      onClick={() => setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="w-full flex items-center justify-between px-3 py-2 bg-brand-50 dark:bg-brand-900 text-xs hover:bg-brand-100 dark:hover:bg-brand-800 transition"
                    >
                      <span className="font-medium text-brand-600 dark:text-brand-300">{label}</span>
                      <span className="flex items-center gap-2 text-brand-400 dark:text-brand-500">
                        <span>{monthItems.length} reminder{monthItems.length !== 1 ? "s" : ""}</span>
                        <span>{openMonths[key] ? "▲" : "▼"}</span>
                      </span>
                    </button>
                    {/* Month reminders */}
                    {openMonths[key] && (
                      <ReminderList items={monthItems} />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default Reminders;
