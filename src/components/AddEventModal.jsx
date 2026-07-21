import { useState } from "react";
import { CATEGORY_COLORS, getCategoryColor } from "../lib/categoryColors";
import ColorPicker from "./ColorPicker";
import { createEvent, createCategory } from "../lib/events";
import { timeToMinutes } from "../lib/dayTimeline";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function minutesToTime(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440; // clamp into a single day
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function AddEventModal({ uid, initialDate, initialStartTime, categories, onClose }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [date, setDate] = useState(initialDate);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(initialStartTime || "09:00");
  const [endTime, setEndTime] = useState(
    minutesToTime(timeToMinutes(initialStartTime || "09:00") + 60)
  );
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0].id);
  const [newCategoryCustomColor, setNewCategoryCustomColor] = useState(null);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const ref = await createCategory(uid, name, newCategoryColor, newCategoryCustomColor);
    setCategoryId(ref.id);
    setNewCategoryName("");
    setNewCategoryCustomColor(null);
    setShowNewCategory(false);
  };

  // When the start time changes, keep the end time at least one hour
  // after it if it would otherwise become invalid (end <= start).
  const handleStartTimeChange = (newStart) => {
    setStartTime(newStart);
    if (timeToMinutes(endTime) <= timeToMinutes(newStart)) {
      setEndTime(minutesToTime(timeToMinutes(newStart) + 60));
    }
  };

  // Prevent the end time from ever being set to the same time as or
  // earlier than the start time.
  const handleEndTimeChange = (newEnd) => {
    if (timeToMinutes(newEnd) <= timeToMinutes(startTime)) return;
    setEndTime(newEnd);
  };

  const handleSave = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    try {
      await createEvent(uid, {
        title: title.trim(),
        details: details.trim(),
        date,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        categoryId: categoryId || null,
        recurrence,
        recurrenceEndDate: recurrence !== "none" ? recurrenceEndDate : null,
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
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100">NEW EVENT</h2>
          <button
            onClick={onClose}
            className="text-brand-400 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* All day toggle */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="accent-brand-500"
            />
            <span className="text-sm text-brand-700 dark:text-brand-200">All day</span>
          </label>

          {/* Time range, only if not all day */}
          {!allDay && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                  End
                </label>
                <input
                  type="time"
                  value={endTime}
                  min={startTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
              Category
            </label>
            {!showNewCategory ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const color = getCategoryColor(cat.color, true, cat.customColor);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border-2 transition ${
                        categoryId === cat.id
                          ? "border-brand-400"
                          : "border-transparent"
                      } ${color.isCustom ? "" : color.badge}`}
                      style={color.isCustom ? color.badgeStyle : undefined}
                    >
                      {color.isCustom ? (
                        <span className="w-2 h-2 rounded-full" style={color.dotStyle} />
                      ) : (
                        <span className={`w-2 h-2 rounded-full ${color.dot}`} />
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

          {/* Recurrence */}
          <div>
            <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
              Repeat
            </label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
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
                  Stop repeating on <span className="font-normal text-brand-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={recurrenceEndDate}
                  min={date}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <p className="text-xs text-brand-400 dark:text-brand-500 mt-1">
                  Leave blank to repeat indefinitely.
                </p>
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
              Details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="w-full py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save event"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddEventModal;
