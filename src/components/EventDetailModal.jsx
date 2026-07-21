import { useState } from "react";
import { CATEGORY_COLORS, getCategoryColor } from "../lib/categoryColors";
import { updateEvent, deleteEvent, createCategory } from "../lib/events";
import { timeToMinutes } from "../lib/dayTimeline";
import { auth } from "../firebase";
import ColorPicker from "./ColorPicker";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTimeLabel(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function minutesToTime(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function EventDetailModal({ occurrence, categories, onClose }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(occurrence.title);
  const [details, setDetails] = useState(occurrence.details || "");
  const [date, setDate] = useState(occurrence.occurrenceDate);
  const [allDay, setAllDay] = useState(occurrence.allDay);
  const [startTime, setStartTime] = useState(occurrence.startTime || "09:00");
  const [endTime, setEndTime] = useState(occurrence.endTime || "10:00");
  const [categoryId, setCategoryId] = useState(occurrence.categoryId || "");
  const [recurrence, setRecurrence] = useState(occurrence.recurrence || "none");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(occurrence.recurrenceEndDate || "");

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0].id);
  const [newCategoryCustomColor, setNewCategoryCustomColor] = useState(null);

  const uid = auth.currentUser?.uid;

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !uid) return;
    const ref = await createCategory(uid, name, newCategoryColor, newCategoryCustomColor);
    setCategoryId(ref.id);
    setNewCategoryName("");
    setNewCategoryCustomColor(null);
    setShowNewCategory(false);
  };

  const handleStartTimeChange = (newStart) => {
    setStartTime(newStart);
    if (timeToMinutes(endTime) <= timeToMinutes(newStart)) {
      setEndTime(minutesToTime(timeToMinutes(newStart) + 60));
    }
  };

  const handleEndTimeChange = (newEnd) => {
    if (timeToMinutes(newEnd) <= timeToMinutes(startTime)) return;
    setEndTime(newEnd);
  };

  // Changing the recurrence type (e.g. picking "Weekly" after it had been
  // stopped, or switching from one frequency to another) should not carry
  // over a stale end date from a previous "Stop repeating" action — that
  // old date is likely in the past or no longer meaningful, and a leftover
  // value there silently breaks the date picker UX. Clear it so the
  // person is prompted to pick a fresh one.
  const handleRecurrenceChange = (newRecurrence) => {
    setRecurrence(newRecurrence);
    if (newRecurrence !== "none" && recurrenceEndDate && recurrenceEndDate <= date) {
      setRecurrenceEndDate("");
    }
  };

  const matchedCategory = categories.find((c) => c.id === occurrence.categoryId);
  const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);
  const categoryName = matchedCategory?.name;

  const handleSave = async () => {
    if (recurrence !== "none" && (!recurrenceEndDate || recurrenceEndDate <= date)) return;
    setSaving(true);
    try {
      const changes = {
        title: title.trim(),
        details: details.trim(),
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        categoryId: categoryId || null,
        recurrence,
        recurrenceEndDate: recurrence !== "none" ? recurrenceEndDate : null,
      };

      // For a non-recurring event, the date field IS the occurrence date,
      // so just update it directly. For a recurring event, changing the
      // date shifts the whole series: we move the anchor `date` by the
      // same number of days the user moved this occurrence, so the
      // recurrence pattern (e.g. "every Monday") is preserved relative
      // to the new date rather than snapping to a fixed day.
      if (!occurrence.isRecurring) {
        changes.date = date;
      } else if (date !== occurrence.occurrenceDate) {
        const [oy, om, od] = occurrence.occurrenceDate.split("-").map(Number);
        const [ny, nm, nd] = date.split("-").map(Number);
        const oldDate = new Date(oy, om - 1, od);
        const newDate = new Date(ny, nm - 1, nd);
        const dayShift = Math.round((newDate - oldDate) / (1000 * 60 * 60 * 24));

        const [sy, sm, sd] = occurrence.date.split("-").map(Number);
        const seriesStart = new Date(sy, sm - 1, sd);
        seriesStart.setDate(seriesStart.getDate() + dayShift);
        const y = seriesStart.getFullYear();
        const m = String(seriesStart.getMonth() + 1).padStart(2, "0");
        const d = String(seriesStart.getDate()).padStart(2, "0");
        changes.date = `${y}-${m}-${d}`;
      }

      await updateEvent(occurrence.id, changes);
      setEditing(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this event? This removes all of its occurrences if it repeats.")) return;
    setSaving(true);
    try {
      await deleteEvent(occurrence.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleStopRecurrence = async () => {
    if (!confirm(`Stop this event from repeating after ${formatDateLabel(occurrence.occurrenceDate)}?`)) return;
    setSaving(true);
    try {
      // Stopping from this occurrence's own date means this is the last
      // time it happens going forward — so the event is no longer
      // "repeating" in any meaningful sense. Revert recurrence to "none"
      // and move `date` to this occurrence's date, so the single
      // remaining instance is the one being viewed (not the series'
      // original first occurrence, which could be long past).
      await updateEvent(occurrence.id, {
        recurrence: "none",
        recurrenceEndDate: null,
        date: occurrence.occurrenceDate,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full sm:w-96 max-h-[90vh] overflow-y-auto bg-white dark:bg-brand-700 rounded-t-2xl sm:rounded-2xl border-2 border-brand-200 dark:border-brand-600 shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100">
            {editing ? "EDIT EVENT" : "EVENT"}
          </h2>
          <button
            onClick={onClose}
            className="text-brand-400 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {!editing ? (
          // ---------- VIEW MODE ----------
          <div className="space-y-3">
            {occurrence.categoryId && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                  color.isCustom ? "" : color.badge
                }`}
                style={color.isCustom ? color.badgeStyle : undefined}
              >
                {color.isCustom ? (
                  <span className="w-2 h-2 rounded-full" style={color.dotStyle} />
                ) : (
                  <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                )}
                {categoryName || "Uncategorized"}
              </span>
            )}

            <h3 className="text-lg font-semibold text-brand-800 dark:text-brand-100">
              {occurrence.title}
            </h3>

            <p className="text-sm text-brand-600 dark:text-brand-300">
              {formatDateLabel(occurrence.occurrenceDate)}
            </p>

            <p className="text-sm text-brand-500 dark:text-brand-400">
              {occurrence.allDay
                ? "All day"
                : `${formatTimeLabel(occurrence.startTime)} – ${formatTimeLabel(occurrence.endTime)}`}
            </p>

            {occurrence.isRecurring && (
              <p className="text-xs text-brand-400 dark:text-brand-500 italic">
                Repeats {occurrence.recurrence}
              </p>
            )}

            {occurrence.details && (
              <p className="text-sm text-brand-600 dark:text-brand-200 whitespace-pre-wrap border-t border-brand-100 dark:border-brand-700 pt-3">
                {occurrence.details}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600"
              >
                Edit
              </button>
              {occurrence.isRecurring && (
                <button
                  onClick={handleStopRecurrence}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-brand-50 dark:bg-brand-700 text-brand-600 dark:text-brand-200 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-600 disabled:opacity-50"
                >
                  Stop repeating
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          // ---------- EDIT MODE ----------
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {occurrence.isRecurring && (
                <p className="text-xs text-brand-400 dark:text-brand-500 mt-1">
                  This event repeats — moving the date shifts the whole series.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="accent-brand-500"
              />
              <span className="text-sm text-brand-700 dark:text-brand-200">All day</span>
            </label>

            {!allDay && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                    Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                    End
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    min={startTime}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                Category
              </label>
              {!showNewCategory ? (
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const c = getCategoryColor(cat.color, true, cat.customColor);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border-2 transition ${
                          categoryId === cat.id ? "border-brand-400" : "border-transparent"
                        } ${c.isCustom ? "" : c.badge}`}
                        style={c.isCustom ? c.badgeStyle : undefined}
                      >
                        {c.isCustom ? (
                          <span className="w-2 h-2 rounded-full" style={c.dotStyle} />
                        ) : (
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                        )}
                        {cat.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowNewCategory(true)}
                    className="px-2.5 py-1 rounded-full text-xs border-2 border-dashed border-brand-300 dark:border-brand-600 text-brand-500 dark:text-brand-400"
                  >
                    + New
                  </button>
                </div>
              ) : (
                <div className="space-y-2 p-3 rounded-lg bg-brand-50 dark:bg-brand-800 border border-brand-200 dark:border-brand-600">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-700 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <ColorPicker
                    value={{ colorId: newCategoryColor, customColor: newCategoryCustomColor }}
                    onChange={({ colorId, customColor }) => {
                      setNewCategoryColor(colorId);
                      setNewCategoryCustomColor(customColor);
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      className="px-3 py-1 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600"
                    >
                      Add category
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewCategory(false)}
                      className="px-3 py-1 text-xs text-brand-500 dark:text-brand-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                Repeat
              </label>
              <select
                value={recurrence}
                onChange={(e) => handleRecurrenceChange(e.target.value)}
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {recurrence !== "none" && (
                <div className="mt-2 p-3 rounded-lg bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600">
                  <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                    Stop repeating on
                  </label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    min={date}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <p className="text-xs text-brand-400 dark:text-brand-500 mt-1">
                    Required for repeating events, so the schedule has a defined end.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                Details
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex-1 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2.5 text-brand-500 dark:text-brand-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EventDetailModal;
