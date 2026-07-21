import { useState } from "react";
import { CATEGORY_COLORS } from "../lib/categoryColors";
import { createHabit, updateHabit } from "../lib/habits";
import ColorPicker from "./ColorPicker";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toggleDay(days, day) {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
}

function HabitForm({ uid, existingHabit, onDone, onCancel }) {
  const [name, setName] = useState(existingHabit?.name || "");
  const [color, setColor] = useState(existingHabit?.color || CATEGORY_COLORS[0].id);
  const [customColor, setCustomColor] = useState(existingHabit?.customColor || null);
  const [trackMode, setTrackMode] = useState(
    existingHabit?.trackType === "timed" ? "timed"
    : existingHabit?.trackType === "monthly" ? "monthly"
    : existingHabit?.trackDays === "daily" || !existingHabit ? "daily"
    : "custom"
  );
  const [customDays, setCustomDays] = useState(
    Array.isArray(existingHabit?.trackDays) ? existingHabit.trackDays : []
  );
  const existingTarget = existingHabit?.targetSeconds || 0;
  const [timedHours, setTimedHours] = useState(Math.floor(existingTarget / 3600) || 16);
  const [timedMinutes, setTimedMinutes] = useState(Math.floor((existingTarget % 3600) / 60) || 0);
  const [timedSeconds, setTimedSeconds] = useState(existingTarget % 60 || 0);
  const [timesPerMonth, setTimesPerMonth] = useState(existingHabit?.timesPerMonth || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Give this a name first."); return; }
    if (trackMode === "custom" && customDays.length === 0) {
      setError("Pick at least one day, or switch to Daily."); return;
    }
    if (trackMode === "timed") {
      const total = timedHours * 3600 + timedMinutes * 60 + timedSeconds;
      if (total === 0) { setError("Set a target duration greater than 0."); return; }
    }
    if (trackMode === "monthly" && timesPerMonth < 1) {
      setError("Set at least 1 time per month."); return;
    }

    setError("");
    setSaving(true);
    try {
      const targetSeconds = timedHours * 3600 + timedMinutes * 60 + timedSeconds;
      const data = {
        name: trimmed,
        color,
        customColor: customColor || null,
        trackType: trackMode === "timed" ? "timed"
          : trackMode === "monthly" ? "monthly"
          : "checkbox",
        trackDays: (trackMode === "timed" || trackMode === "monthly") ? "daily"
          : trackMode === "daily" ? "daily"
          : customDays,
        ...(trackMode === "timed" ? { targetSeconds } : {}),
        ...(trackMode === "monthly" ? { timesPerMonth: Number(timesPerMonth) } : {}),
      };
      if (existingHabit) {
        await updateHabit(existingHabit.id, data);
      } else {
        await createHabit(uid, data);
      }
      onDone();
    } catch (err) {
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-300 dark:border-brand-600">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Read 10 pages, 16:8 Fast, Period"
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
      />

      <ColorPicker
        value={{ colorId: color, customColor }}
        onChange={({ colorId, customColor: cc }) => { setColor(colorId); setCustomColor(cc); }}
      />

      <div>
        <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1.5">Track type</label>
        <div className="flex gap-2 mb-2 flex-wrap">
          {[
            ["daily", "Every day"],
            ["custom", "Specific days"],
            ["timed", "⏱ Timed"],
            ["monthly", "📅 Monthly"],
          ].map(([mode, label]) => (
            <button key={mode} type="button" onClick={() => setTrackMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                trackMode === mode
                  ? "bg-brand-600 text-white"
                  : "bg-white dark:bg-brand-900 text-brand-500 dark:text-brand-300 border border-brand-200 dark:border-brand-600"
              }`}
            >{label}</button>
          ))}
        </div>

        {trackMode === "custom" && (
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((d, i) => (
              <button key={i} type="button" onClick={() => setCustomDays((prev) => toggleDay(prev, i))}
                className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
                  customDays.includes(i)
                    ? "bg-brand-600 text-white"
                    : "bg-white dark:bg-brand-900 text-brand-500 dark:text-brand-300 border border-brand-200 dark:border-brand-600"
                }`}
              >{d[0]}</button>
            ))}
          </div>
        )}

        {trackMode === "timed" && (
          <div className="space-y-2">
            <p className="text-xs text-brand-500 dark:text-brand-400">Target duration — must reach this to count as success</p>
            <div className="flex items-center gap-2">
              {[
                ["h", timedHours, setTimedHours, 0, 99],
                ["m", timedMinutes, setTimedMinutes, 0, 59],
                ["s", timedSeconds, setTimedSeconds, 0, 59],
              ].map(([unit, val, setter, min, max]) => (
                <div key={unit} className="flex items-center gap-1">
                  <input type="number" min={min} max={max} value={val}
                    onChange={(e) => setter(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
                    className="w-14 text-center rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                  />
                  <span className="text-xs text-brand-500 dark:text-brand-400">{unit}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-brand-400 dark:text-brand-500 italic">e.g. 16h 0m for 16:8 intermittent fasting</p>
          </div>
        )}

        {trackMode === "monthly" && (
          <div className="space-y-2">
            <p className="text-xs text-brand-500 dark:text-brand-400">How many times per month?</p>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={31} value={timesPerMonth}
                onChange={(e) => setTimesPerMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                className="w-20 text-center rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
              <span className="text-xs text-brand-500 dark:text-brand-400">times this month</span>
            </div>
            <p className="text-[10px] text-brand-400 dark:text-brand-500 italic">
              e.g. 1 for period tracking, 4 for weekly cleaning
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-brand-500 dark:text-brand-300">Cancel</button>
      </div>
    </div>
  );
}

export default HabitForm;
